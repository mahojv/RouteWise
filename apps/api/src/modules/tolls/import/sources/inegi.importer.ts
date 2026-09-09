import { TollDataImporter, RawTollRecord, ImportResult, ImportValidationWarning } from '../importer.interface';
import { normalizeHighway, normalizePlazaName, isWithinMexicoBounds } from '../normalizer';
import { getDbPool } from '../../../../database';
import { env } from '../../../../config/env';

export class InegiSakbeImporter implements TollDataImporter {
  readonly sourceCode = 'INEGI_SAKBE';
  readonly sourceName = 'Instituto Nacional de Estadística y Geografía (INEGI Sakbe v3.1)';
  private readonly defaultApiKey = process.env.INEGI_SAKBE_API_KEY || env.INEGI_SAKBE_API_KEY || '';

  /**
   * Parsea contenido raw de INEGI Sakbe (JSON array o respuestas de detalle de ruta de INEGI)
   */
  async parse(rawContent: string): Promise<RawTollRecord[]> {
    const records: RawTollRecord[] = [];

    if (!rawContent || rawContent.trim().length === 0) {
      return records;
    }

    try {
      const parsed = JSON.parse(rawContent);
      const items = Array.isArray(parsed) ? parsed : (parsed.data || parsed.records || [parsed]);

      for (const item of items) {
        if (!item) continue;

        let lat = NaN;
        let lon = NaN;

        if (item.punto_caseta) {
          try {
            const geoObj = typeof item.punto_caseta === 'string' ? JSON.parse(item.punto_caseta) : item.punto_caseta;
            if (geoObj.coordinates && Array.isArray(geoObj.coordinates)) {
              lon = parseFloat(geoObj.coordinates[0]);
              lat = parseFloat(geoObj.coordinates[1]);
            }
          } catch {
            // Continuar si la geometría no es GeoJSON directo
          }
        }

        if (isNaN(lat) && item.latitude) lat = parseFloat(item.latitude);
        if (isNaN(lon) && item.longitude) lon = parseFloat(item.longitude);
        if (isNaN(lat) && item.lat) lat = parseFloat(item.lat);
        if (isNaN(lon) && item.lon) lon = parseFloat(item.lon);

        const rawName = item.direccion || item.caseta || item.nombre || item.plazaName;
        const price = parseFloat(item.costo_caseta || item.precio || item.cashPrice || 0);
        const highway = item.carretera || item.nombre_vialidad || item.highwayCode;

        if (rawName && !isNaN(lat) && !isNaN(lon)) {
          records.push({
            plazaName: String(rawName).replace(/^Cruce la caseta\s+/i, '').trim(),
            highwayCode: highway ? String(highway) : undefined,
            operator: 'CAPUFE / CONCESIONARIO',
            latitude: lat,
            longitude: lon,
            direction: 'both',
            vehicleType: 'automovil',
            cashPrice: price,
            electronicPrice: price,
          });
        }
      }
    } catch {
      // Si el rawContent no es JSON directamente, retornar arreglo vacío
    }

    return records;
  }

  /**
   * Consulta las casetas directamente desde la API oficial Sakbe de INEGI para un conjunto de destinos
   */
  async fetchFromInegiApi(destinations: string[], apiKey: string = this.defaultApiKey): Promise<RawTollRecord[]> {
    const records: RawTollRecord[] = [];
    const key = apiKey || this.defaultApiKey;

    // Buscar IDs de destinos en INEGI
    const destIds: { id: string; name: string }[] = [];
    for (const dest of destinations) {
      try {
        const body = new URLSearchParams({ buscar: dest, type: 'json', key, num: '5' });
        const res = await fetch('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', { method: 'POST', body });
        const json: any = await res.json();
        if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
          destIds.push({ id: json.data[0].id_dest, name: json.data[0].nombre });
        }
      } catch (e) {
        console.warn(`⚠️ Error buscando destino INEGI para '${dest}':`, e);
      }
    }

    // Probar combinaciones de rutas principales para extraer casetas
    for (let i = 0; i < destIds.length; i++) {
      for (let j = i + 1; j < destIds.length; j++) {
        try {
          const body = new URLSearchParams({
            dest_i: destIds[i].id,
            dest_f: destIds[j].id,
            v: '1',
            type: 'json',
            key,
          });

          const detailRes = await fetch('https://gaia.inegi.org.mx/sakbe_v3.1/detalle_c', { method: 'POST', body });
          const detailJson: any = await detailRes.json();

          if (detailJson && detailJson.data && Array.isArray(detailJson.data)) {
            for (const seg of detailJson.data) {
              if (seg.costo_caseta && parseFloat(seg.costo_caseta) > 0) {
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

                const price = parseFloat(seg.costo_caseta);
                const rawName = (seg.direccion || 'Caseta').replace(/^Cruce la caseta\s+/i, '').trim();

                records.push({
                  plazaName: rawName,
                  operator: 'INEGI / SCT',
                  latitude: lat,
                  longitude: lon,
                  direction: 'both',
                  vehicleType: 'automovil',
                  cashPrice: price,
                  electronicPrice: price,
                });
              }
            }
          }
        } catch (err) {
          console.warn(`⚠️ Error obteniendo detalle de ruta INEGI [${destIds[i].name} -> ${destIds[j].name}]:`, err);
        }
      }
    }

    return records;
  }

  /**
   * Valida coordenadas y campos requeridos
   */
  validate(records: RawTollRecord[]): { valid: RawTollRecord[]; warnings: ImportValidationWarning[] } {
    const valid: RawTollRecord[] = [];
    const warnings: ImportValidationWarning[] = [];

    records.forEach((rec, idx) => {
      const row = idx + 1;

      if (!rec.plazaName || rec.plazaName.trim().length === 0) {
        warnings.push({ row, field: 'plazaName', message: 'Nombre de caseta vacío' });
        return;
      }

      if (isNaN(rec.latitude) || isNaN(rec.longitude)) {
        warnings.push({ row, field: 'coordinates', message: 'Coordenadas no válidas' });
        return;
      }

      if (!isWithinMexicoBounds(rec.latitude, rec.longitude)) {
        warnings.push({ row, field: 'coordinates', message: `Coordenadas [${rec.latitude}, ${rec.longitude}] fuera de México` });
        return;
      }

      valid.push({
        ...rec,
        plazaName: normalizePlazaName(rec.plazaName),
        highwayCode: normalizeHighway(rec.highwayCode),
      });
    });

    return { valid, warnings };
  }

  /**
   * Importa casetas y tarifas oficializadas por INEGI Sakbe a la base de datos
   */
  async import(rawContent: string, options: { dryRun?: boolean; sourceId?: string } = {}): Promise<ImportResult> {
    const rawRecords = await this.parse(rawContent);
    const { valid, warnings } = this.validate(rawRecords);

    const result: ImportResult = {
      sourceCode: this.sourceCode,
      totalRows: rawRecords.length,
      validRows: valid.length,
      plazasCreated: 0,
      plazasUpdated: 0,
      ratesCreated: 0,
      ratesUpdated: 0,
      skipped: rawRecords.length - valid.length,
      warnings,
      errors: [],
      dryRun: !!options.dryRun,
    };

    if (options.dryRun) {
      result.plazasCreated = valid.length;
      result.ratesCreated = valid.length;
      return result;
    }

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Registrar o sincronizar data source INEGI SAKBE
      let sourceId = options.sourceId;
      if (!sourceId) {
        const srcRes = await client.query(`
          INSERT INTO data_sources (name, code, url, description, last_synced_at)
          VALUES (
            $1, $2, 'https://gaia.inegi.org.mx/sakbe_v3.1/',
            'Red Nacional de Caminos y Tarificador Oficial INEGI Sakbe v3.1',
            NOW()
          )
          ON CONFLICT (code) DO UPDATE SET last_synced_at = NOW()
          RETURNING id;
        `, [this.sourceName, this.sourceCode]);
        sourceId = srcRes.rows[0]?.id;
      }

      for (const rec of valid) {
        const existingPlaza = await client.query(`
          SELECT id FROM toll_plazas
          WHERE name = $1 OR (ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 200))
          LIMIT 1;
        `, [rec.plazaName, rec.longitude, rec.latitude]);

        let plazaId: string;

        if (existingPlaza.rows.length > 0) {
          plazaId = existingPlaza.rows[0].id;
          await client.query(`
            UPDATE toll_plazas
            SET latitude = $1,
                longitude = $2,
                geom = ST_SetSRID(ST_MakePoint($2, $1), 4326),
                updated_at = NOW()
            WHERE id = $3;
          `, [rec.latitude, rec.longitude, plazaId]);
          result.plazasUpdated++;
        } else {
          const insRes = await client.query(`
            INSERT INTO toll_plazas (
              name, operator, highway, road, latitude, longitude, geom, direction, source_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($6, $5), 4326), 'both', $7
            )
            RETURNING id;
          `, [
            rec.plazaName,
            rec.operator || 'INEGI / CAPUFE',
            rec.highwayCode,
            rec.roadName,
            rec.latitude,
            rec.longitude,
            sourceId,
          ]);
          plazaId = insRes.rows[0]?.id;
          result.plazasCreated++;
        }

        // Upsert tarifa para automóvil
        if (rec.cashPrice > 0) {
          const existingRate = await client.query(`
            SELECT id FROM toll_rates WHERE toll_plaza_id = $1 AND vehicle_type = $2;
          `, [plazaId, rec.vehicleType]);

          if (existingRate.rows.length > 0) {
            await client.query(`
              UPDATE toll_rates
              SET cash_price = $1, electronic_price = $2, source_id = $3, updated_at = NOW()
              WHERE id = $4;
            `, [rec.cashPrice, rec.electronicPrice || rec.cashPrice, sourceId, existingRate.rows[0].id]);
            result.ratesUpdated++;
          } else {
            await client.query(`
              INSERT INTO toll_rates (toll_plaza_id, vehicle_type, cash_price, electronic_price, currency, source_id, effective_from)
              VALUES ($1, $2, $3, $4, 'MXN', $5, NOW());
            `, [plazaId, rec.vehicleType, rec.cashPrice, rec.electronicPrice || rec.cashPrice, sourceId]);
            result.ratesCreated++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      result.errors.push(err.message || String(err));
      throw err;
    } finally {
      client.release();
    }

    return result;
  }
}
