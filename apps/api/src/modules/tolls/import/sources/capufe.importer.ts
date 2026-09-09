import { TollDataImporter, RawTollRecord, ImportResult, ImportValidationWarning } from '../importer.interface';
import { normalizeHighway, normalizePlazaName, normalizeVehicleType, isWithinMexicoBounds } from '../normalizer';
import { getDbPool } from '../../../../database';

export class CapufeCsvImporter implements TollDataImporter {
  readonly sourceCode = 'CAPUFE_OFICIAL';
  readonly sourceName = 'Caminos y Puentes Federales (CAPUFE)';

  /**
   * Parsea un archivo CSV con formato de casetas y tarifas de CAPUFE / SCT
   */
  async parse(rawContent: string): Promise<RawTollRecord[]> {
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      return [];
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const records: RawTollRecord[] = [];

    // Localizar índices de columnas
    const colMap = {
      nombre: header.findIndex((h) => h.includes('nombre') || h.includes('caseta') || h.includes('plaza')),
      carretera: header.findIndex((h) => h.includes('carretera') || h.includes('autopista') || h.includes('highway')),
      tramo: header.findIndex((h) => h.includes('tramo') || h.includes('road')),
      operador: header.findIndex((h) => h.includes('operador') || h.includes('concesionario')),
      latitud: header.findIndex((h) => h.includes('latitud') || h.includes('lat')),
      longitud: header.findIndex((h) => h.includes('longitud') || h.includes('lon') || h.includes('lng')),
      direccion: header.findIndex((h) => h.includes('direccion') || h.includes('sentido') || h.includes('dir')),
      km: header.findIndex((h) => h.includes('km') || h.includes('kilometro')),
      tipoVehiculo: header.findIndex((h) => h.includes('tipo') || h.includes('vehiculo') || h.includes('clase')),
      tarifaEfectivo: header.findIndex((h) => h.includes('efectivo') || h.includes('precio') || h.includes('tarifa') || h.includes('cash')),
      tarifaTag: header.findIndex((h) => h.includes('tag') || h.includes('electronico') || h.includes('iave')),
      vigenciaDesde: header.findIndex((h) => h.includes('desde') || h.includes('vigencia_desde')),
      vigenciaHasta: header.findIndex((h) => h.includes('hasta') || h.includes('vigencia_hasta')),
    };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Soporte para comas simples (CSV standard)
      const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));

      const name = colMap.nombre !== -1 ? cols[colMap.nombre] : cols[0];
      const highway = colMap.carretera !== -1 ? cols[colMap.carretera] : undefined;
      const road = colMap.tramo !== -1 ? cols[colMap.tramo] : undefined;
      const operator = colMap.operador !== -1 ? cols[colMap.operador] : 'CAPUFE';
      const lat = colMap.latitud !== -1 ? parseFloat(cols[colMap.latitud]) : NaN;
      const lon = colMap.longitud !== -1 ? parseFloat(cols[colMap.longitud]) : NaN;
      const direction = colMap.direccion !== -1 ? cols[colMap.direccion] : 'both';
      const km = colMap.km !== -1 && cols[colMap.km] ? parseFloat(cols[colMap.km]) : undefined;
      const vehicleType = colMap.tipoVehiculo !== -1 ? normalizeVehicleType(cols[colMap.tipoVehiculo]) : 'automovil';
      const cashPrice = colMap.tarifaEfectivo !== -1 ? parseFloat(cols[colMap.tarifaEfectivo]) : NaN;
      const electronicPrice = colMap.tarifaTag !== -1 && cols[colMap.tarifaTag] ? parseFloat(cols[colMap.tarifaTag]) : cashPrice;
      const effectiveFrom = colMap.vigenciaDesde !== -1 ? cols[colMap.vigenciaDesde] : undefined;
      const effectiveUntil = colMap.vigenciaHasta !== -1 ? cols[colMap.vigenciaHasta] : undefined;

      records.push({
        plazaName: name,
        highwayCode: highway,
        roadName: road,
        operator: operator || 'CAPUFE',
        latitude: lat,
        longitude: lon,
        direction: direction || 'both',
        kmMarker: km,
        vehicleType,
        cashPrice,
        electronicPrice,
        effectiveFrom,
        effectiveUntil,
      });
    }

    return records;
  }

  /**
   * Valida coordenadas, precios y campos requeridos
   */
  validate(records: RawTollRecord[]): { valid: RawTollRecord[]; warnings: ImportValidationWarning[] } {
    const valid: RawTollRecord[] = [];
    const warnings: ImportValidationWarning[] = [];

    records.forEach((rec, idx) => {
      const row = idx + 2; // Contando cabecera y 1-based index

      if (!rec.plazaName || rec.plazaName.trim().length === 0) {
        warnings.push({ row, field: 'plazaName', message: 'Nombre de caseta vacío o no válido' });
        return;
      }

      if (isNaN(rec.latitude) || isNaN(rec.longitude)) {
        warnings.push({ row, field: 'coordinates', message: 'Coordenadas lat/lon no son números válidos', data: { lat: rec.latitude, lon: rec.longitude } });
        return;
      }

      if (!isWithinMexicoBounds(rec.latitude, rec.longitude)) {
        warnings.push({
          row,
          field: 'coordinates',
          message: `Coordenadas [${rec.latitude}, ${rec.longitude}] fuera de los límites de México`,
        });
        return;
      }

      if (isNaN(rec.cashPrice) || rec.cashPrice < 0) {
        warnings.push({ row, field: 'cashPrice', message: `Precio en efectivo inválido: ${rec.cashPrice}` });
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
   * Importa los registros validados a la base de datos de forma idempotente
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
      // En dry run solo contamos potenciales entidades
      const uniquePlazas = new Set(valid.map((v) => `${v.plazaName}_${v.latitude}_${v.longitude}`));
      result.plazasCreated = uniquePlazas.size;
      result.ratesCreated = valid.length;
      return result;
    }

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Obtener o crear source_id
      let sourceId = options.sourceId;
      if (!sourceId) {
        const srcRes = await client.query(`
          INSERT INTO data_sources (name, code, description, last_synced_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (code) DO UPDATE SET last_synced_at = NOW()
          RETURNING id;
        `, [this.sourceName, this.sourceCode, 'Importación oficial de tarifas CAPUFE']);
        sourceId = srcRes.rows[0]?.id;
      }

      // Agrupar registros por caseta física (misma ubicación y nombre)
      const plazaMap = new Map<string, { plaza: RawTollRecord; rates: RawTollRecord[] }>();
      for (const rec of valid) {
        const key = `${rec.plazaName}|${rec.latitude.toFixed(4)}|${rec.longitude.toFixed(4)}`;
        if (!plazaMap.has(key)) {
          plazaMap.set(key, { plaza: rec, rates: [] });
        }
        plazaMap.get(key)!.rates.push(rec);
      }

      for (const [, item] of plazaMap) {
        const { plaza, rates } = item;

        // Upsert caseta
        const existingPlaza = await client.query(`
          SELECT id FROM toll_plazas
          WHERE name = $1 OR (ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 100))
          LIMIT 1;
        `, [plaza.plazaName, plaza.longitude, plaza.latitude]);

        let plazaId: string;

        if (existingPlaza.rows.length > 0) {
          plazaId = existingPlaza.rows[0].id;
          await client.query(`
            UPDATE toll_plazas
            SET highway = COALESCE($1, highway),
                road = COALESCE($9, road),
                operator = COALESCE($2, operator),
                km_marker = COALESCE($3, km_marker),
                direction = COALESCE($4, direction),
                source_id = $5,
                latitude = $6,
                longitude = $7,
                geom = ST_SetSRID(ST_MakePoint($7, $6), 4326),
                updated_at = NOW()
            WHERE id = $8;
          `, [plaza.highwayCode, plaza.operator, plaza.kmMarker, plaza.direction, sourceId, plaza.latitude, plaza.longitude, plazaId, plaza.roadName]);
          result.plazasUpdated++;
        } else {
          const insertRes = await client.query(`
            INSERT INTO toll_plazas (
              name, operator, highway, road, latitude, longitude, geom, direction, km_marker, source_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($6, $5), 4326), $7, $8, $9
            )
            RETURNING id;
          `, [
            plaza.plazaName,
            plaza.operator || 'CAPUFE',
            plaza.highwayCode,
            plaza.roadName,
            plaza.latitude,
            plaza.longitude,
            plaza.direction || 'both',
            plaza.kmMarker,
            sourceId,
          ]);
          plazaId = insertRes.rows[0]?.id;
          result.plazasCreated++;
        }

        // Upsert tarifas para cada tipo de vehículo
        for (const rate of rates) {
          const existingRate = await client.query(`
            SELECT id FROM toll_rates
            WHERE toll_plaza_id = $1 AND vehicle_type = $2;
          `, [plazaId, rate.vehicleType]);

          if (existingRate.rows.length > 0) {
            await client.query(`
              UPDATE toll_rates
              SET cash_price = $1,
                  electronic_price = $2,
                  effective_from = $3,
                  effective_until = $4,
                  source_id = $5,
                  last_verified_at = NOW(),
                  updated_at = NOW()
              WHERE id = $6;
            `, [
              rate.cashPrice,
              rate.electronicPrice ?? rate.cashPrice,
              rate.effectiveFrom ? new Date(rate.effectiveFrom) : null,
              rate.effectiveUntil ? new Date(rate.effectiveUntil) : null,
              sourceId,
              existingRate.rows[0].id,
            ]);
            result.ratesUpdated++;
          } else {
            await client.query(`
              INSERT INTO toll_rates (
                toll_plaza_id, vehicle_type, cash_price, electronic_price, currency, source_id, effective_from, effective_until
              )
              VALUES ($1, $2, $3, $4, 'MXN', $5, $6, $7);
            `, [
              plazaId,
              rate.vehicleType,
              rate.cashPrice,
              rate.electronicPrice ?? rate.cashPrice,
              sourceId,
              rate.effectiveFrom ? new Date(rate.effectiveFrom) : null,
              rate.effectiveUntil ? new Date(rate.effectiveUntil) : null,
            ]);
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
