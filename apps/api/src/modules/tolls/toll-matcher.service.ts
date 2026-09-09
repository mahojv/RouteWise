import { VehicleType, TollEvent } from '@routewise/types';
import { getDbPool } from '../../database';
import { TollCostService } from './toll-cost.service';
import { normalizeHighway } from './import/normalizer';

export interface MatchTollsOptions {
  highwayHints?: string[];
  vehicleType?: VehicleType;
  radiusMeters?: number;
  direction?: string;
  avoidTollIds?: string[];
}

/**
 * Valida si una caseta es compatible con los nombres o códigos de carreteras transitados
 */
export function isHighwayCompatible(
  plaza: { highway?: string; road?: string; name?: string },
  highwayHints?: string[]
): boolean {
  if (!highwayHints || highwayHints.length === 0) {
    return true;
  }

  const clean = (s: string) =>
    s
      ? s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      : '';

  const plazaTokens = [
    plaza.highway,
    plaza.road,
    plaza.name,
  ]
    .filter(Boolean)
    .map((s) => clean(s!));

  const plazaNumbers = [plaza.highway, plaza.road, plaza.name]
    .filter(Boolean)
    .flatMap((s) => s!.match(/\d+/g) || []);

  for (const hint of highwayHints) {
    const hintClean = clean(hint);
    if (!hintClean) continue;

    // Coincidencia directa de texto
    for (const token of plazaTokens) {
      if (token.includes(hintClean) || hintClean.includes(token)) {
        return true;
      }
    }

    // Coincidencia de número de carretera (ej. 57 en "MEX-057D" y "57D")
    for (const num of plazaNumbers) {
      const cleanNum = num.replace(/^0+/, '');
      if (cleanNum.length >= 2 && hintClean.includes(cleanNum)) {
        return true;
      }
    }

    // Coincidencia de palabras clave específicas de caseta/corredor
    const keyCorridors = [
      'arconorte',
      'palmillas',
      'tepotzotlan',
      'tinaja',
      'acayucan',
      'esperanza',
      'cuitlahuac',
      'amozoc',
      'sanmarcos',
      'chichimequillas',
      'celaya',
      'sanluis',
    ];
    for (const corr of keyCorridors) {
      if (hintClean.includes(corr)) {
        for (const token of plazaTokens) {
          if (token.includes(corr)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export class TollMatcherService {
  private tollCostService: TollCostService;

  constructor(tollCostService?: TollCostService) {
    this.tollCostService = tollCostService || new TollCostService();
  }

  /**
   * Identifica y ordena casetas a lo largo de las coordenadas de una ruta
   * Aplica filtros espaciales (ST_DWithin), validación de carretera y dirección
   */
  /**
   * Identifica y ordena casetas a lo largo de las coordenadas de una ruta
   * Aplica matching en dos niveles: 120m estandar y fallback a 250m con validacion estricta
   */
  public async matchTollsAlongRoute(
    coordinates: [number, number][],
    options: MatchTollsOptions = {}
  ): Promise<TollEvent[]> {
    if (!coordinates || coordinates.length < 2) {
      return [];
    }

    const primaryRadius = 120;
    const fallbackMaxRadius = options.radiusMeters && options.radiusMeters > primaryRadius ? options.radiusMeters : 250;
    const vehicleType = options.vehicleType ?? 'automovil';
    const avoidTollIds = options.avoidTollIds || [];
    const highwayHints = options.highwayHints || [];

    try {
      const pool = getDbPool();
      const step = Math.min(3, Math.max(1, Math.floor(coordinates.length / 2000)));
      const sampledCoords = coordinates.filter((_, idx) => idx % step === 0 || idx === coordinates.length - 1);
      const lineWkt = `LINESTRING(${sampledCoords.map(([lon, lat]) => `${lon} ${lat}`).join(', ')})`;

      const query = `
        WITH route AS (
          SELECT ST_GeomFromText($1, 4326) AS geom,
                 ST_GeomFromText($1, 4326)::geography AS geog
        )
        SELECT
          tp.id,
          tp.name,
          tp.operator,
          tp.highway,
          tp.road,
          tp.latitude,
          tp.longitude,
          tp.direction,
          tp.km_marker,
          ST_Distance(tp.geom::geography, route.geog) AS distance_meters,
          ST_LineLocatePoint(route.geom, tp.geom) AS route_progress,
          tr.cash_price,
          tr.electronic_price,
          tr.currency,
          tr.effective_from,
          tr.effective_until,
          tr.last_verified_at
        FROM toll_plazas tp
        CROSS JOIN route
        LEFT JOIN toll_rates tr ON tr.toll_plaza_id = tp.id AND tr.vehicle_type = $2
        WHERE ST_DWithin(tp.geom::geography, route.geog, $3)
        ORDER BY route_progress ASC;
      `;

      const res = await pool.query(query, [lineWkt, vehicleType, fallbackMaxRadius]);
      const events: TollEvent[] = [];

      for (const row of res.rows) {
        const dist = Number(row.distance_meters);

        // Nivel 1 (<= 120m): Validacion estandar de carretera
        // Nivel 2 (120m < dist <= 250m): Validacion estricta (requiere hints y compatibilidad confirmada)
        if (highwayHints.length > 0) {
          const compatible = isHighwayCompatible(
            { highway: row.highway, road: row.road, name: row.name },
            highwayHints
          );
          if (!compatible) {
            continue;
          }
        } else if (dist > primaryRadius) {
          // Si esta en rango fallback pero no hay hints de carretera para verificar, ignorar para evitar falsos positivos
          continue;
        }

        if (options.direction && row.direction && row.direction !== 'both') {
          if (row.direction !== options.direction) {
            continue;
          }
        }

        const status = this.tollCostService.evaluatePriceStatus({
          cashPrice: row.cash_price,
          electronicPrice: row.electronic_price,
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until,
          lastVerifiedAt: row.last_verified_at,
        });

        const isAvoided = avoidTollIds.includes(row.id);

        events.push({
          id: `toll-evt-${row.id}`,
          tollPlazaId: row.id,
          name: row.name,
          operator: row.operator || 'CAPUFE',
          highway: row.highway,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          price: status === 'UNKNOWN' ? 0 : Number(row.cash_price || 0),
          priceStatus: status,
          effectiveDate: row.effective_from ? new Date(row.effective_from).toISOString() : undefined,
          routePosition: Number(Number(row.route_progress).toFixed(4)),
          paymentMethod: 'CASH',
          isAvoided,
        });
      }

      return events;
    } catch {
      return this.matchInMemory(coordinates, options);
    }
  }

  /**
   * Fallback espacial en memoria para tests offline y cálculo sin base de datos
   * Aplica matching en dos niveles: 120m primario y fallback de 250m sujeto a compatibilidad estricta
   */
  public matchInMemory(
    coordinates: [number, number][],
    options: MatchTollsOptions = {}
  ): TollEvent[] {
    const knownPlazas = [
      {
        id: 'plaza-palmillas',
        name: 'Caseta Palmillas (Autopista México - Querétaro 57D)',
        highway: 'MEX-057D',
        road: 'México - Querétaro',
        operator: 'CAPUFE',
        latitude: 20.3069,
        longitude: -99.9349,
        kmMarker: 148.0,
        direction: 'both',
        cashPrice: 108.0,
      },
      {
        id: 'plaza-tepotzotlan',
        name: 'Caseta Tepotzotlán (Autopista México - Querétaro 57D)',
        highway: 'MEX-057D',
        road: 'México - Querétaro',
        operator: 'CAPUFE',
        latitude: 19.714400,
        longitude: -99.207500,
        kmMarker: 43.0,
        direction: 'both',
        cashPrice: 108.0,
      },
      {
        id: 'plaza-chichimequillas',
        name: 'Caseta Chichimequillas (Libramiento Norponiente Querétaro)',
        highway: 'MEX-057D-LIB',
        road: 'Libramiento Norponiente Querétaro',
        operator: 'CONCESIONARIO',
        latitude: 20.738100,
        longitude: -100.327500,
        kmMarker: 18.0,
        direction: 'both',
        cashPrice: 65.0,
      },
      {
        id: 'plaza-queretaro-celaya',
        name: 'Caseta Querétaro - Celaya (Cuota 45D)',
        highway: 'MEX-045D',
        road: 'Querétaro - Irapuato',
        operator: 'CAPUFE',
        latitude: 20.551200,
        longitude: -100.485100,
        kmMarker: 12.0,
        direction: 'both',
        cashPrice: 95.0,
      },
      {
        id: 'plaza-puerto-mexico',
        name: 'Caseta Puerto México (Querétaro - San Luis Potosí 57D)',
        highway: 'MEX-057D',
        road: 'Querétaro - San Luis Potosí',
        operator: 'FONADIN',
        latitude: 21.315000,
        longitude: -100.563000,
        kmMarker: 88.0,
        direction: 'both',
        cashPrice: 145.0,
      },
      {
        id: 'plaza-san-marcos',
        name: 'Caseta San Marcos (México - Puebla 150D)',
        highway: 'MEX-150D',
        road: 'México - Puebla',
        operator: 'CAPUFE',
        latitude: 19.323500,
        longitude: -98.887400,
        kmMarker: 33.0,
        direction: 'both',
        cashPrice: 156.0,
      },
      {
        id: 'plaza-queretaro-arco-norte',
        name: 'Caseta Querétaro - Arco Norte (Autopista Arco Norte M40D)',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        operator: 'CONCESIONARIO',
        latitude: 19.996598,
        longitude: -99.490843,
        kmMarker: 18.0,
        direction: 'both',
        cashPrice: 115.0,
      },
      {
        id: 'plaza-tula-arco-norte',
        name: 'Caseta Tula - Arco Norte (Autopista Arco Norte M40D)',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        operator: 'CONCESIONARIO',
        latitude: 20.068881,
        longitude: -99.225835,
        kmMarker: 45.0,
        direction: 'both',
        cashPrice: 95.0,
      },
      {
        id: 'plaza-pachuca-arco-norte',
        name: 'Caseta Pachuca - Arco Norte (Autopista Arco Norte M40D)',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        operator: 'CONCESIONARIO',
        latitude: 19.930860,
        longitude: -98.896466,
        kmMarker: 88.0,
        direction: 'both',
        cashPrice: 130.0,
      },
      {
        id: 'plaza-texmelucan-arco-norte',
        name: 'Caseta San Martín Texmelucan - Arco Norte',
        highway: 'MEX-M40D',
        road: 'Autopista Arco Norte',
        operator: 'CONCESIONARIO',
        latitude: 19.402391,
        longitude: -98.422697,
        kmMarker: 172.0,
        direction: 'both',
        cashPrice: 165.0,
      },
      {
        id: 'plaza-amozoc',
        name: 'Caseta Amozoc (Puebla - Acacingo 150D)',
        highway: 'MEX-150D',
        road: 'Puebla - Acacingo',
        operator: 'CAPUFE',
        latitude: 19.055247,
        longitude: -98.055725,
        kmMarker: 142.0,
        direction: 'both',
        cashPrice: 85.0,
      },
      {
        id: 'plaza-esperanza',
        name: 'Caseta Esperanza (Puebla - Orizaba 150D)',
        highway: 'MEX-150D',
        road: 'Puebla - Orizaba',
        operator: 'CAPUFE',
        latitude: 18.858224,
        longitude: -97.360131,
        kmMarker: 221.0,
        direction: 'both',
        cashPrice: 160.0,
      },
      {
        id: 'plaza-cuitlahuac',
        name: 'Caseta Cuitláhuac (Córdoba - Veracruz 150D)',
        highway: 'MEX-150D',
        road: 'Córdoba - Veracruz',
        operator: 'CAPUFE',
        latitude: 18.823259,
        longitude: -96.709435,
        kmMarker: 291.0,
        direction: 'both',
        cashPrice: 128.0,
      },
      {
        id: 'plaza-la-tinaja',
        name: 'Caseta La Tinaja - Cosamaloapan (145D)',
        highway: 'MEX-145D',
        road: 'La Tinaja - Acayucan',
        operator: 'CAPUFE',
        latitude: 18.273046,
        longitude: -95.716454,
        kmMarker: 82.0,
        direction: 'both',
        cashPrice: 250.0,
      },
      {
        id: 'plaza-acayucan',
        name: 'Caseta Acayucan (La Tinaja - Acayucan 145D)',
        highway: 'MEX-145D',
        road: 'La Tinaja - Acayucan',
        operator: 'CAPUFE',
        latitude: 17.911190,
        longitude: -94.917807,
        kmMarker: 188.0,
        direction: 'both',
        cashPrice: 95.0,
      },
      {
        id: 'plaza-sanchez-magallanes',
        name: 'Caseta Sánchez Magallanes - La Venta (180D)',
        highway: 'MEX-180D',
        road: 'Agua Dulce - Cárdenas',
        operator: 'CAPUFE',
        latitude: 18.062320,
        longitude: -94.040975,
        kmMarker: 42.0,
        direction: 'both',
        cashPrice: 90.0,
      },
    ];

    const primaryRadius = 120;
    const maxRadius = options.radiusMeters && options.radiusMeters > primaryRadius ? options.radiusMeters : 250;
    const avoidTollIds = options.avoidTollIds || [];
    const highwayHints = options.highwayHints || [];
    const events: TollEvent[] = [];

    for (const plaza of knownPlazas) {
      let minDist = Infinity;
      let closestIdx = -1;

      for (let i = 0; i < coordinates.length; i++) {
        const [lon, lat] = coordinates[i];
        const dLat = (lat - plaza.latitude) * 111000;
        const dLon = (lon - plaza.longitude) * 102000;
        const dist = Math.hypot(dLat, dLon);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      // Nivel 1 (<= 120m) o Nivel 2 (120m < dist <= 250m con compatibilidad de carretera)
      if (minDist <= maxRadius) {
        if (highwayHints.length > 0) {
          const compatible = isHighwayCompatible(
            { highway: plaza.highway, road: plaza.road, name: plaza.name },
            highwayHints
          );
          if (!compatible) {
            continue;
          }
        } else if (minDist > primaryRadius) {
          continue;
        }

        const progress = Number((closestIdx / Math.max(1, coordinates.length - 1)).toFixed(4));
        const isAvoided = avoidTollIds.includes(plaza.id);

        events.push({
          id: `toll-evt-${plaza.id}`,
          tollPlazaId: plaza.id,
          name: plaza.name,
          operator: plaza.operator,
          highway: plaza.highway,
          latitude: plaza.latitude,
          longitude: plaza.longitude,
          price: plaza.cashPrice,
          priceStatus: 'VALID',
          routePosition: progress,
          paymentMethod: 'CASH',
          isAvoided,
        });
      }
    }

    events.sort((a, b) => a.routePosition - b.routePosition);
    return events;
  }
}
