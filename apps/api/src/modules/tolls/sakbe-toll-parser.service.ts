import { TollEvent, VehicleType, TollPriceStatus } from '@routewise/types';
import { normalizePlazaName, normalizeHighway, isWithinMexicoBounds } from './import/normalizer';
import { getDbPool } from '../../database';

export interface SakbeSegmentRaw {
  geojson?: string;
  eje_excedente?: number;
  costo_caseta?: number | string;
  tiempo_min?: number;
  long_m?: number;
  punto_caseta?: string | null | {
    type?: string;
    coordinates?: [number, number];
  };
  direccion?: string;
  giro?: number;
  carretera?: string;
  nombre_vialidad?: string;
  [key: string]: any;
}

export interface SakbeResponseRaw {
  data?: SakbeSegmentRaw[];
  meta?: {
    fuente?: string;
    [key: string]: any;
  };
  response?: {
    success?: boolean;
    message?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ParsedSakbeTollItem {
  name: string;
  rawName: string;
  highway?: string;
  road?: string;
  latitude: number;
  longitude: number;
  price: number | null;
  priceStatus: TollPriceStatus;
  observedPrice?: number;
  routePosition: number;
  segmentIndex: number;
  giro?: number;
  sourceProvider: 'SAKBE_DETALLE_C' | 'SAKBE_DETALLE_L' | 'SAKBE_DETALLE_O' | 'SAKBE_DETALLE';
  sourceEventType?: 'SAKBE_DETALLE_C' | 'SAKBE_DETALLE_L' | 'SAKBE_DETALLE_O' | 'SAKBE_DETALLE' | 'STATIC' | 'MANUAL';
}

export interface IngestedTollEvent extends TollEvent {
  discoveredFrom?: string;
  observedAt?: string;
}

/**
 * Servicio especializado en el parseo seguro y descubrimiento dinámico
 * de casetas y eventos de peaje a partir de respuestas SAKBÉ (detalle_c, detalle_l, detalle_o).
 */
export class SakbeTollParserService {
  /**
   * Parsea de manera segura el JSON de detalle_c / detalle_l / detalle_o
   * extrayendo únicamente los tramos donde punto_caseta != null y/o direccion de caseta
   */
  public parseSakbeDetail(
    rawInput: string | SakbeResponseRaw,
    sourceType: 'SAKBE_DETALLE_C' | 'SAKBE_DETALLE_L' | 'SAKBE_DETALLE_O' | 'SAKBE_DETALLE' = 'SAKBE_DETALLE'
  ): ParsedSakbeTollItem[] {
    let parsed: SakbeResponseRaw;

    if (typeof rawInput === 'string') {
      if (!rawInput.trim()) return [];
      try {
        parsed = JSON.parse(rawInput);
      } catch {
        return [];
      }
    } else {
      parsed = rawInput;
    }

    const segments = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.data) ? parsed.data : []);

    if (!segments || segments.length === 0) {
      return [];
    }

    const totalSegments = segments.length;
    const items: ParsedSakbeTollItem[] = [];

    // Calcular longitud acumulada total para routePosition preciso
    let totalLengthM = 0;
    const accumulatedDistances: number[] = [];
    for (let i = 0; i < totalSegments; i++) {
      const segLen = Math.max(0, parseFloat(String(segments[i]?.long_m || 0)) || 0);
      totalLengthM += segLen;
      accumulatedDistances.push(totalLengthM);
    }

    for (let i = 0; i < totalSegments; i++) {
      const seg = segments[i];
      if (!seg) continue;

      // REGLA ESTRICTA: Solo es caseta válida si contiene punto_caseta no nulo.
      // NO inventar casetas basándose únicamente en el texto de direccion.
      if (!seg.punto_caseta) {
        continue;
      }

      let lat = NaN;
      let lon = NaN;

      if (typeof seg.punto_caseta === 'string') {
        try {
          const geo = JSON.parse(seg.punto_caseta);
          if (geo && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
            lon = parseFloat(geo.coordinates[0]);
            lat = parseFloat(geo.coordinates[1]);
          }
        } catch {
          // punto_caseta con JSON inválido -> NO utilizar seg.geojson de fallback
        }
      } else if (typeof seg.punto_caseta === 'object') {
        if (Array.isArray(seg.punto_caseta.coordinates) && seg.punto_caseta.coordinates.length >= 2) {
          lon = parseFloat(seg.punto_caseta.coordinates[0]);
          lat = parseFloat(seg.punto_caseta.coordinates[1]);
        }
      }

      // Validar bounds geográficos en México y coordenadas válidas
      if (isNaN(lat) || isNaN(lon) || !isWithinMexicoBounds(lat, lon)) {
        continue;
      }

      const rawName = String(seg.direccion || 'Caseta de Cobro').trim();
      const normName = normalizePlazaName(rawName);
      
      // Evaluación precisa del costo observado: UNKNOWN nunca se convierte a 0
      const rawPrice = seg.costo_caseta;
      let price: number | null = null;
      let observedPrice: number | undefined = undefined;
      let priceStatus: TollPriceStatus = 'UNKNOWN';

      if (rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== '') {
        const parsedPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(String(rawPrice));
        if (!isNaN(parsedPrice) && parsedPrice >= 0) {
          price = parsedPrice;
          observedPrice = parsedPrice;
          priceStatus = 'VALID';
        }
      }
      
      // routePosition basado en distancia acumulada si long_m está disponible
      const currentDist = accumulatedDistances[i] || 0;
      const progress = totalLengthM > 0
        ? Number((currentDist / totalLengthM).toFixed(4))
        : Number((i / Math.max(1, totalSegments - 1)).toFixed(4));
      
      const highway = normalizeHighway(seg.carretera || seg.nombre_vialidad);

      items.push({
        name: normName || rawName,
        rawName,
        highway,
        road: seg.direccion,
        latitude: lat,
        longitude: lon,
        price,
        priceStatus,
        observedPrice,
        routePosition: progress,
        segmentIndex: i,
        giro: seg.giro,
        sourceProvider: sourceType,
        sourceEventType: sourceType,
      });
    }

    return this.deduplicateParsedItems(items);
  }

  /**
   * Deduplica casetas detectadas consecutivamente en la misma ruta
   * (evita que un paso de caseta dividido en 2 microtramos genere 2 casetas)
   */
  public deduplicateParsedItems(items: ParsedSakbeTollItem[]): ParsedSakbeTollItem[] {
    const unique: ParsedSakbeTollItem[] = [];

    for (const item of items) {
      const duplicate = unique.some((existing) => {
        const dLat = (existing.latitude - item.latitude) * 111000;
        const dLon = (existing.longitude - item.longitude) * 102000;
        const distMeters = Math.hypot(dLat, dLon);

        const nameMatch = existing.name.toLowerCase() === item.name.toLowerCase();

        // Misma caseta si dist <= 300m o (dist <= 800m y mismo nombre)
        return distMeters <= 300 || (distMeters <= 800 && nameMatch);
      });

      if (!duplicate) {
        unique.push(item);
      }
    }

    return unique;
  }

  /**
   * Convierte los items parseados a TollEvent[] listos para ser utilizados por el optimizador
   */
  public toTollEvents(items: ParsedSakbeTollItem[], vehicleType: VehicleType = 'automovil'): TollEvent[] {
    return items.map((item, idx) => ({
      id: `sakbe-toll-${idx + 1}-${Math.round(item.latitude * 10000)}-${Math.round(item.longitude * 10000)}`,
      tollPlazaId: `sakbe-plaza-${Math.round(item.latitude * 10000)}-${Math.round(item.longitude * 10000)}`,
      name: item.name,
      operator: 'INEGI / CAPUFE',
      highway: item.highway,
      road: item.road,
      latitude: item.latitude,
      longitude: item.longitude,
      price: item.priceStatus === 'VALID' ? item.price : null,
      priceStatus: item.priceStatus,
      observedPrice: item.observedPrice,
      giro: item.giro,
      sourceProvider: item.sourceProvider,
      sourceEventType: item.sourceEventType || item.sourceProvider,
      effectiveDate: new Date().toISOString(),
      routePosition: item.routePosition,
      paymentMethod: 'CASH',
      isAvoided: false,
      matchStatus: 'MATCHED',
      confidence: 'HIGH',
    }));
  }

  /**
   * Persiste incrementalmente las casetas descubiertas en la base de datos (toll_plazas y toll_rates)
   * con deduplicación por nombre y radio espacial (<= 250m)
   */
  public async persistDiscoveredTolls(
    items: ParsedSakbeTollItem[],
    vehicleType: VehicleType = 'automovil'
  ): Promise<{ created: number; updated: number }> {
    if (items.length === 0) return { created: 0, updated: 0 };

    try {
      const pool = getDbPool();
      let created = 0;
      let updated = 0;

      // Registrar o sincronizar data source INEGI SAKBE
      const srcRes = await pool.query(`
        INSERT INTO data_sources (name, code, url, description, last_synced_at)
        VALUES (
          'Instituto Nacional de Estadística y Geografía (INEGI Sakbe v3.1)',
          'INEGI_SAKBE',
          'https://gaia.inegi.org.mx/sakbe_v3.1/',
          'Descubrimiento dinámico de casetas y tarifas de la Red Nacional de Caminos',
          NOW()
        )
        ON CONFLICT (code) DO UPDATE SET last_synced_at = NOW()
        RETURNING id;
      `);
      const sourceId = srcRes.rows[0]?.id;

      for (const item of items) {
        // Deduplicación robusta: coincidencia por nombre o proximidad espacial <= 250m
        const existingPlaza = await pool.query(`
          SELECT id, name FROM toll_plazas
          WHERE name = $1 OR (ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 250))
          LIMIT 1;
        `, [item.name, item.longitude, item.latitude]);

        let plazaId: string;

        if (existingPlaza.rows.length > 0) {
          plazaId = existingPlaza.rows[0].id;
          await pool.query(`
            UPDATE toll_plazas
            SET latitude = $1,
                longitude = $2,
                geom = ST_SetSRID(ST_MakePoint($2, $1), 4326),
                last_verified_at = NOW(),
                updated_at = NOW()
            WHERE id = $3;
          `, [item.latitude, item.longitude, plazaId]);
          updated++;
        } else {
          const insRes = await pool.query(`
            INSERT INTO toll_plazas (
              name, operator, highway, road, latitude, longitude, geom, direction, source_id, source
            )
            VALUES (
              $1, 'INEGI / CAPUFE', $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326), 'both', $6, 'INEGI_SAKBE'
            )
            RETURNING id;
          `, [
            item.name,
            item.highway,
            item.road,
            item.latitude,
            item.longitude,
            sourceId,
          ]);
          plazaId = insRes.rows[0]?.id;
          created++;
        }

        if (plazaId && item.price !== null && item.price >= 0 && item.priceStatus === 'VALID') {
          await pool.query(`
            INSERT INTO toll_rates (
              toll_plaza_id, vehicle_type, cash_price, electronic_price, currency, source_id, effective_from, last_verified_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $3, 'MXN', $4, NOW(), NOW(), NOW(), NOW())
            ON CONFLICT (toll_plaza_id, vehicle_type)
            DO UPDATE SET
              cash_price = EXCLUDED.cash_price,
              electronic_price = EXCLUDED.electronic_price,
              source_id = EXCLUDED.source_id,
              last_verified_at = NOW(),
              updated_at = NOW();
          `, [plazaId, vehicleType, item.price, sourceId]);
        }
      }

      return { created, updated };
    } catch {
      return { created: 0, updated: 0 };
    }
  }
}
