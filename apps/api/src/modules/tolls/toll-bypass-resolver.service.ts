import { TollEvent, TollBypassCandidate, Coordinate } from '@routewise/types';
import { getDbPool } from '../../database';

export interface RouteGeometryHolder {
  geometry: {
    coordinates: [number, number][]; // [lon, lat]
  };
}

export type CuratedBypassMap = Record<string, {
  exitPoint: Coordinate;
  reentryPoint: Coordinate;
  name?: string;
  confidence?: number;
  isVerified?: boolean;
}>;

/**
 * Calcula la distancia Haversine en metros entre dos coordenadas [lon, lat]
 */
export function haversineDistanceMeters(
  coord1: [number, number] | Coordinate,
  coord2: [number, number] | Coordinate
): number {
  const [lon1, lat1] = Array.isArray(coord1) ? coord1 : [coord1.longitude, coord1.latitude];
  const [lon2, lat2] = Array.isArray(coord2) ? coord2 : [coord2.longitude, coord2.latitude];

  const R = 6371000; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula la distancia acumulada en metros a lo largo de una polilínea hasta el punto más cercano a una coordenada objetivo
 */
export function getCumulativeDistanceToPoint(
  target: Coordinate | [number, number],
  coordinates: [number, number][]
): { distanceMeters: number; closestIndex: number; minDistanceToPolyline: number } {
  const targetCoord: [number, number] = Array.isArray(target)
    ? target
    : [target.longitude, target.latitude];

  let minDist = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < coordinates.length; i++) {
    const dist = haversineDistanceMeters(targetCoord, coordinates[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }

  let accumulatedMeters = 0;
  for (let i = 0; i < closestIdx; i++) {
    accumulatedMeters += haversineDistanceMeters(coordinates[i], coordinates[i + 1]);
  }

  return {
    distanceMeters: Math.round(accumulatedMeters),
    closestIndex: closestIdx,
    minDistanceToPolyline: minDist,
  };
}

export class TollBypassResolverService {
  private fallbackBypasses?: CuratedBypassMap;

  constructor(fallbackBypasses?: CuratedBypassMap) {
    this.fallbackBypasses = fallbackBypasses;
  }

  /**
   * Resuelve deterministamente un bypass para una caseta de cobro (100% local, 0 llamadas OSRM)
   * Tier 1: CURATED (Base de datos PostgreSQL - Única Fuente de Verdad)
   * Tier 2: ROUTE_DIVERGENCE (Requiere FreeBaseRoute)
   * Tier 3: NO_BYPASS (Retorna null)
   */
  public async resolveBypass(
    toll: TollEvent,
    fastRoute: RouteGeometryHolder,
    freeBaseRoute?: RouteGeometryHolder | null
  ): Promise<TollBypassCandidate | null> {
    const fastCoords = fastRoute.geometry.coordinates;
    if (!fastCoords || fastCoords.length < 2) {
      return null;
    }

    // -------------------------------------------------------------
    // TIER 1: CURATED (Consultar en base de datos PostgreSQL)
    // -------------------------------------------------------------
    const curatedFromDb = await this.findCuratedInDb(toll.tollPlazaId);
    if (curatedFromDb && curatedFromDb.isVerified) {
      const exitCalc = getCumulativeDistanceToPoint(curatedFromDb.exitPoint, fastCoords);
      const reentryCalc = getCumulativeDistanceToPoint(curatedFromDb.reentryPoint, fastCoords);

      return {
        tollPlazaId: toll.tollPlazaId,
        exitPoint: curatedFromDb.exitPoint,
        reentryPoint: curatedFromDb.reentryPoint,
        exitDistanceMeters: exitCalc.distanceMeters,
        reentryDistanceMeters: reentryCalc.distanceMeters,
        confidence: curatedFromDb.confidence ?? 1.0,
        source: 'CURATED',
        isVerified: true,
        name: curatedFromDb.name,
      };
    }

    // Fallback opcional inyectado vía DI para tests unitarios offline sin conexión DB activa
    if (this.fallbackBypasses) {
      const curatedFixture = this.fallbackBypasses[toll.tollPlazaId] ||
        Object.entries(this.fallbackBypasses).find(([k]) =>
          toll.name?.toLowerCase().includes(k.replace('plaza-', ''))
        )?.[1];

      if (curatedFixture && (curatedFixture.isVerified ?? true)) {
        const exitCalc = getCumulativeDistanceToPoint(curatedFixture.exitPoint, fastCoords);
        const reentryCalc = getCumulativeDistanceToPoint(curatedFixture.reentryPoint, fastCoords);

        return {
          tollPlazaId: toll.tollPlazaId,
          exitPoint: curatedFixture.exitPoint,
          reentryPoint: curatedFixture.reentryPoint,
          exitDistanceMeters: exitCalc.distanceMeters,
          reentryDistanceMeters: reentryCalc.distanceMeters,
          confidence: curatedFixture.confidence ?? 1.0,
          source: 'CURATED',
          isVerified: true,
          name: curatedFixture.name,
        };
      }
    }

    // -------------------------------------------------------------
    // TIER 2: ROUTE_DIVERGENCE (Requiere FreeBaseRoute)
    // -------------------------------------------------------------
    if (freeBaseRoute && freeBaseRoute.geometry?.coordinates?.length > 1) {
      const divergenceCandidate = this.resolveByRouteDivergence(toll, fastRoute, freeBaseRoute);
      if (divergenceCandidate) {
        return divergenceCandidate;
      }
    }

    // -------------------------------------------------------------
    // TIER 3: NO_BYPASS (Rechazo seguro)
    // -------------------------------------------------------------
    return null;
  }

  /**
   * Consulta bypasses curados en la base de datos PostgreSQL
   */
  private async findCuratedInDb(tollPlazaId: string): Promise<{
    exitPoint: Coordinate;
    reentryPoint: Coordinate;
    name?: string;
    confidence: number;
    isVerified: boolean;
  } | null> {
    try {
      const pool = getDbPool();
      const nameKey = tollPlazaId.replace('plaza-', '');
      const res = await pool.query(`
        SELECT b.exit_lat, b.exit_lng, b.reentry_lat, b.reentry_lng, b.exit_name, b.reentry_name, b.confidence, b.is_verified, b.notes
        FROM toll_bypasses b
        JOIN toll_plazas tp ON tp.id = b.toll_plaza_id
        WHERE (b.toll_plaza_id::text = $1 OR tp.name ILIKE '%' || $2 || '%')
          AND b.is_verified = TRUE
        LIMIT 1;
      `, [tollPlazaId, nameKey]);

      if (res.rows.length === 0) {
        return null;
      }

      const row = res.rows[0];
      return {
        exitPoint: { latitude: Number(row.exit_lat), longitude: Number(row.exit_lng) },
        reentryPoint: { latitude: Number(row.reentry_lat), longitude: Number(row.reentry_lng) },
        name: row.exit_name ? `${row.exit_name} / ${row.reentry_name}` : row.notes,
        confidence: Number(row.confidence || 1.0),
        isVerified: Boolean(row.is_verified),
      };
    } catch {
      return null;
    }
  }

  /**
   * Resuelve un bypass geométrico analizando la divergencia ortogonal entre la ruta rápida y la ruta libre base
   */
  private resolveByRouteDivergence(
    toll: TollEvent,
    fastRoute: RouteGeometryHolder,
    freeBaseRoute: RouteGeometryHolder
  ): TollBypassCandidate | null {
    const fastCoords = fastRoute.geometry.coordinates;
    const freeCoords = freeBaseRoute.geometry.coordinates;

    const tollCoord: [number, number] = [toll.longitude, toll.latitude];
    const tollLoc = getCumulativeDistanceToPoint(tollCoord, fastCoords);
    const tollIdx = tollLoc.closestIndex;

    // Buscar hacia atrás (antes de la caseta) un punto de bifurcación
    // Radio de búsqueda: entre 3 km y 18 km antes de la caseta
    let exitCoord: Coordinate | null = null;

    let searchDist = 0;
    for (let i = tollIdx; i >= 1; i--) {
      searchDist += haversineDistanceMeters(fastCoords[i], fastCoords[i - 1]);
      if (searchDist >= 3000 && searchDist <= 18000) {
        // Comprobar cercanía a la ruta libre base (< 1500m)
        const freeCheck = getCumulativeDistanceToPoint(fastCoords[i], freeCoords);
        if (freeCheck.minDistanceToPolyline < 1500) {
          exitCoord = { latitude: fastCoords[i][1], longitude: fastCoords[i][0] };
          break;
        }
      }
    }

    // Buscar hacia adelante (después de la caseta) un punto de reconexión
    let reentryCoord: Coordinate | null = null;

    searchDist = 0;
    for (let i = tollIdx; i < fastCoords.length - 1; i++) {
      searchDist += haversineDistanceMeters(fastCoords[i], fastCoords[i + 1]);
      if (searchDist >= 3000 && searchDist <= 18000) {
        const freeCheck = getCumulativeDistanceToPoint(fastCoords[i], freeCoords);
        if (freeCheck.minDistanceToPolyline < 1500) {
          reentryCoord = { latitude: fastCoords[i][1], longitude: fastCoords[i][0] };
          break;
        }
      }
    }

    if (exitCoord && reentryCoord) {
      const exitCalc = getCumulativeDistanceToPoint(exitCoord, fastCoords);
      const reentryCalc = getCumulativeDistanceToPoint(reentryCoord, fastCoords);

      if (exitCalc.distanceMeters < reentryCalc.distanceMeters) {
        return {
          tollPlazaId: toll.tollPlazaId,
          exitPoint: exitCoord,
          reentryPoint: reentryCoord,
          exitDistanceMeters: exitCalc.distanceMeters,
          reentryDistanceMeters: reentryCalc.distanceMeters,
          confidence: 0.8,
          source: 'ROUTE_DIVERGENCE',
          isVerified: false,
          name: `Bypass por Divergencia Libre (${toll.name})`,
        };
      }
    }

    return null;
  }
}
