import { Coordinate } from '@routewise/types';
import { getDbPool } from '../../database';
import { normalizePlazaName, normalizeHighway } from './import/normalizer';
import { env } from '../../config/env';

export interface InegiLiveSyncResult {
  liveTollsFound: number;
  updatedPrices: Map<string, number>;
  totalInegiCost?: number;
}

export class InegiLiveSyncService {
  private getApiKey(): string {
    return process.env.INEGI_SAKBE_API_KEY || env.INEGI_SAKBE_API_KEY || 'kqvCNH1V-keUF-rSVa-O1tf-gdqFN6DynMNN';
  }

  /**
   * Consulta a la API oficial de INEGI Sakbe v3.1 en tiempo real usando coordenadas exactas (buscalinea)
   * o nombres de destino (buscadestino).
   */
  async syncLiveTariffs(
    origin: Coordinate,
    destination: Coordinate,
    vehicleType = 'automovil'
  ): Promise<InegiLiveSyncResult> {
    const key = this.getApiKey();
    const updatedPrices = new Map<string, number>();

    try {
      let origId: string | null = null;
      let origSource: string | null = null;
      let origTarget: string | null = null;

      let destId: string | null = null;
      let destSource: string | null = null;
      let destTarget: string | null = null;

      // Helper para fetch con timeout rápido de 5s
      const fetchWithTimeout = async (url: string, body: URLSearchParams): Promise<any> => {
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(url, { method: 'POST', body, signal: controller.signal });
          return await res.json();
        } finally {
          clearTimeout(tId);
        }
      };

      // 1. Intentar resolver origen y destino en paralelo por coordenadas (buscalinea)
      const bodyOrigLine = new URLSearchParams({ x: String(origin.longitude), y: String(origin.latitude), escala: '10000', type: 'json', key });
      const bodyDestLine = new URLSearchParams({ x: String(destination.longitude), y: String(destination.latitude), escala: '10000', type: 'json', key });

      const [jsonOrig, jsonDest] = await Promise.all([
        fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscalinea', bodyOrigLine).catch(() => null),
        fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscalinea', bodyDestLine).catch(() => null),
      ]);

      if (jsonOrig?.data?.id_routing_net) {
        origId = String(jsonOrig.data.id_routing_net);
        origSource = String(jsonOrig.data.source);
        origTarget = String(jsonOrig.data.target);
      }

      if (jsonDest?.data?.id_routing_net) {
        destId = String(jsonDest.data.id_routing_net);
        destSource = String(jsonDest.data.source);
        destTarget = String(jsonDest.data.target);
      }

      // 2. Si buscalinea por coordenadas no devolvió IDs, intentar por nombre de ciudad en paralelo
      let isDestToDest = false;
      let destOrigId: string | null = null;
      let destDestId: string | null = null;

      if (!origId || !destId) {
        const cleanName = (s?: string) => (s ? s.split(',')[0].trim() : '');
        const origCity = cleanName((origin as any).label) || 'Queretaro';
        const destCity = cleanName((destination as any).label) || 'Chihuahua';

        const bodyO = new URLSearchParams({ buscar: origCity, type: 'json', key, num: '3' });
        const bodyD = new URLSearchParams({ buscar: destCity, type: 'json', key, num: '3' });

        const [jsonO, jsonD] = await Promise.all([
          fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', bodyO).catch(() => null),
          fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', bodyD).catch(() => null),
        ]);

        destOrigId = jsonO?.data?.[0]?.id_dest || null;
        destDestId = jsonD?.data?.[0]?.id_dest || null;

        if (destOrigId && destDestId) {
          isDestToDest = true;
        }
      }

      // Si no fue posible resolver ni por coordenadas ni por nombre, terminar
      if (!isDestToDest && (!origId || !destId)) {
        return { liveTollsFound: 0, updatedPrices };
      }

      // 3. Consultar detalle de casetas a la API de INEGI Sakbe
      const vehicleCode = vehicleType === 'motocicleta' ? '0' : vehicleType === 'autobus' ? '2' : vehicleType === 'camion_2_ejes' ? '5' : '1';

      const routeBody = isDestToDest
        ? new URLSearchParams({
            dest_i: String(destOrigId),
            dest_f: String(destDestId),
            v: vehicleCode,
            type: 'json',
            key,
          })
        : new URLSearchParams({
            id_i: String(origId),
            source_i: String(origSource),
            target_i: String(origTarget),
            id_f: String(destId),
            source_f: String(destSource),
            target_f: String(destTarget),
            v: vehicleCode,
            type: 'json',
            key,
          });

      const detailJson: any = await fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/detalle_c', routeBody).catch(() => null);

      if (!detailJson?.data || !Array.isArray(detailJson.data)) {
        return { liveTollsFound: 0, updatedPrices };
      }

      const pool = getDbPool();
      let liveTollsFound = 0;
      let totalInegiCost = 0;

      // Obtener o crear sourceId para INEGI_SAKBE
      const srcRes = await pool.query(`
        INSERT INTO data_sources (name, code, url, description, last_synced_at)
        VALUES ('Instituto Nacional de Estadística y Geografía (INEGI Sakbe v3.1)', 'INEGI_SAKBE', 'https://gaia.inegi.org.mx/sakbe_v3.1/', 'Tarifas y red vial oficial del INEGI', NOW())
        ON CONFLICT (code) DO UPDATE SET last_synced_at = NOW()
        RETURNING id;
      `);
      const sourceId = srcRes.rows[0]?.id;

      for (const seg of detailJson.data) {
        const isTollSegment = Boolean(seg.punto_caseta) || (seg.direccion && /^Cruce la caseta/i.test(seg.direccion)) || (seg.costo_caseta !== undefined && seg.costo_caseta !== null && String(seg.costo_caseta).trim() !== '');

        if (isTollSegment) {
          const price = parseFloat(seg.costo_caseta || '0') || 0;
          totalInegiCost += price;

          let lat = NaN;
          let lon = NaN;

          if (seg.punto_caseta) {
            try {
              const geo = typeof seg.punto_caseta === 'string' ? JSON.parse(seg.punto_caseta) : seg.punto_caseta;
              if (geo.coordinates) {
                lon = parseFloat(geo.coordinates[0]);
                lat = parseFloat(geo.coordinates[1]);
              }
            } catch {
              // ignorar parse err
            }
          }

          const rawName = String(seg.direccion || 'Caseta').replace(/^Cruce la caseta\s+/i, '').trim();
          const normName = normalizePlazaName(rawName);

          updatedPrices.set(normName, price);
          liveTollsFound++;

          // Si tenemos coordenadas de la caseta enviadas en vivo por INEGI Sakbe, hacer upsert en PostgreSQL
          if (!isNaN(lat) && !isNaN(lon)) {
            try {
              const existingPlaza = await pool.query(`
                SELECT id FROM toll_plazas
                WHERE name = $1 OR (ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 200))
                LIMIT 1;
              `, [normName, lon, lat]);

              let plazaId: string;

              if (existingPlaza.rows.length > 0) {
                plazaId = existingPlaza.rows[0].id;
                await pool.query(`
                  UPDATE toll_plazas
                  SET latitude = $1, longitude = $2, geom = ST_SetSRID(ST_MakePoint($2, $1), 4326), updated_at = NOW()
                  WHERE id = $3;
                `, [lat, lon, plazaId]);
              } else {
                const insRes = await pool.query(`
                  INSERT INTO toll_plazas (name, operator, highway, road, latitude, longitude, geom, direction, source_id)
                  VALUES ($1, 'INEGI / CAPUFE', $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326), 'both', $6)
                  RETURNING id;
                `, [normName, normalizeHighway(seg.nombre), seg.direccion, lat, lon, sourceId]);
                plazaId = insRes.rows[0]?.id;
              }

              if (plazaId) {
                await pool.query(`
                  INSERT INTO toll_rates (
                    toll_plaza_id,
                    vehicle_type,
                    cash_price,
                    electronic_price,
                    currency,
                    source_id,
                    effective_from,
                    last_verified_at,
                    created_at,
                    updated_at
                  )
                  VALUES ($1, $2, $3, $3, 'MXN', $4, NOW(), NOW(), NOW(), NOW())
                  ON CONFLICT (toll_plaza_id, vehicle_type)
                  DO UPDATE SET
                    cash_price = EXCLUDED.cash_price,
                    electronic_price = EXCLUDED.electronic_price,
                    currency = EXCLUDED.currency,
                    source_id = EXCLUDED.source_id,
                    last_verified_at = NOW(),
                    updated_at = NOW();
                `, [plazaId, vehicleType, price, sourceId]);
              }
            } catch (dbErr) {
              console.warn(`⚠️ Error guardando caseta en vivo '${normName}':`, dbErr);
            }
          }
        }
      }

      console.log(`📡 INEGI Sakbe Live Sync: ${liveTollsFound} casetas encontradas para esta ruta en vivo (Costo Total INEGI: $${totalInegiCost} MXN).`);
      return { liveTollsFound, updatedPrices, totalInegiCost };
    } catch (err) {
      console.warn('⚠️ Falló la sincronización en vivo con INEGI Sakbe:', err);
      return { liveTollsFound: 0, updatedPrices };
    }
  }
}
