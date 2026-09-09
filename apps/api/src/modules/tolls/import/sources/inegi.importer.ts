import { TollDataImporter, RawTollRecord, ImportResult, ImportValidationWarning } from '../importer.interface';
import { normalizeHighway, normalizePlazaName, isWithinMexicoBounds } from '../normalizer';
import { SakbeTollParserService } from '../../sakbe-toll-parser.service';
import { getDbPool } from '../../../../database';
import { env } from '../../../../config/env';

export interface InegiCorridor {
  origin: string;
  destination: string;
}

/**
 * Corredores troncales prioritarios de la Red Carretera Nacional
 * Evita la complejidad combinatoria N x N ejecutando únicamente ~13 rutas estratégicas
 */
export const DEFAULT_INEGI_CORRIDORS: InegiCorridor[] = [
  { origin: 'Mexico', destination: 'Queretaro' },
  { origin: 'Mexico', destination: 'Puebla' },
  { origin: 'Mexico', destination: 'Acapulco' },
  { origin: 'Mexico', destination: 'Toluca' },
  { origin: 'Queretaro', destination: 'Guadalajara' },
  { origin: 'Queretaro', destination: 'San Luis Potosi' },
  { origin: 'San Luis Potosi', destination: 'Monterrey' },
  { origin: 'Puebla', destination: 'Veracruz' },
  { origin: 'Veracruz', destination: 'Villahermosa' },
  { origin: 'Villahermosa', destination: 'Merida' },
  { origin: 'Merida', destination: 'Cancun' },
  { origin: 'Monterrey', destination: 'Saltillo' },
  { origin: 'Saltillo', destination: 'Torreon' },
];

export class InegiSakbeImporter implements TollDataImporter {
  readonly sourceCode = 'INEGI_SAKBE';
  readonly sourceName = 'Instituto Nacional de Estadística y Geografía (INEGI Sakbe v3.1)';
  private readonly defaultApiKey = process.env.INEGI_SAKBE_API_KEY || env.INEGI_SAKBE_API_KEY || '';

  /**
   * Ejecuta peticiones HTTP con control de tiempo límite (Timeout)
   */
  private async fetchWithTimeout(url: string, body: URLSearchParams, timeoutMs = 5000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { method: 'POST', body, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parsea contenido raw de INEGI Sakbe (JSON array o respuestas de detalle de ruta de INEGI)
   */
  async parse(rawContent: string): Promise<RawTollRecord[]> {
    const records: RawTollRecord[] = [];

    if (!rawContent || rawContent.trim().length === 0) {
      return records;
    }

    try {
      const parser = new SakbeTollParserService();
      const items = parser.parseSakbeDetail(rawContent);

      for (const item of items) {
        records.push({
          plazaName: item.name,
          highwayCode: item.highway,
          roadName: item.road,
          operator: 'INEGI / CAPUFE',
          latitude: item.latitude,
          longitude: item.longitude,
          direction: 'both',
          vehicleType: 'automovil',
          cashPrice: item.price ?? 0,
          electronicPrice: item.price ?? 0,
        });
      }
    } catch {
      // Si el rawContent no es JSON directamente, retornar arreglo vacío
    }

    return records;
  }

  /**
   * Sincronización eficiente basada en corredores troncales clave
   * Realiza ~25 solicitudes HTTP en total en lugar de combinaciones masivas N x N
   */
  async fetchFromInegiCorridors(
    corridors: InegiCorridor[] = DEFAULT_INEGI_CORRIDORS,
    apiKey: string = this.defaultApiKey,
    timeoutMs = 5000
  ): Promise<RawTollRecord[]> {
    const records: RawTollRecord[] = [];
    const key = apiKey || this.defaultApiKey;
    if (!key) {
      console.warn('⚠️ INEGI_SAKBE_API_KEY no configurada. Omite sincronización online.');
      return records;
    }

    const destCache = new Map<string, { id: string; name: string }>();

    const getDestId = async (name: string): Promise<{ id: string; name: string } | null> => {
      const cleanName = name.trim().toLowerCase();
      if (destCache.has(cleanName)) {
        return destCache.get(cleanName)!;
      }

      try {
        const body = new URLSearchParams({ buscar: name, type: 'json', key, num: '5' });
        const res = await this.fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', body, timeoutMs);
        const json: any = await res.json();
        if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
          const entry = { id: String(json.data[0].id_dest), name: String(json.data[0].nombre) };
          destCache.set(cleanName, entry);
          return entry;
        }
      } catch (e: any) {
        console.warn(`⚠️ Timeout o error buscando destino INEGI para '${name}':`, e.message || String(e));
      }
      return null;
    };

    for (const corridor of corridors) {
      const orig = await getDestId(corridor.origin);
      const dest = await getDestId(corridor.destination);

      if (!orig || !dest) continue;

      try {
        const body = new URLSearchParams({
          dest_i: orig.id,
          dest_f: dest.id,
          v: '1',
          type: 'json',
          key,
        });

        const detailRes = await this.fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/detalle_c', body, timeoutMs);
        const detailJson: any = await detailRes.json();

        const parser = new SakbeTollParserService();
        const items = parser.parseSakbeDetail(detailJson, 'SAKBE_DETALLE_C');

        for (const item of items) {
          records.push({
            plazaName: item.name,
            highwayCode: item.highway,
            roadName: item.road,
            operator: 'INEGI / CAPUFE',
            latitude: item.latitude,
            longitude: item.longitude,
            direction: 'both',
            vehicleType: 'automovil',
            cashPrice: item.price ?? 0,
            electronicPrice: item.price ?? 0,
          });
        }
      } catch (err: any) {
        console.warn(`⚠️ Error obteniendo detalle de ruta INEGI [${corridor.origin} -> ${corridor.destination}]:`, err.message || String(err));
      }
    }

    return records;
  }

  /**
   * Mantiene compatibilidad con invocaciones por lista de destinos utilizando el sincronizador optimizado
   */
  async fetchFromInegiApi(destinations: string[], apiKey: string = this.defaultApiKey): Promise<RawTollRecord[]> {
    if (!destinations || destinations.length < 2) return [];
    
    // Crear corredores secuenciales entre las ciudades proporcionadas
    const corridors: InegiCorridor[] = [];
    for (let i = 0; i < destinations.length - 1; i++) {
      corridors.push({ origin: destinations[i], destination: destinations[i + 1] });
    }
    return this.fetchFromInegiCorridors(corridors, apiKey);
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
