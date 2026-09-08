import { VehicleType, TollEvent } from '@routewise/types';
import { getDbPool } from '../../database';
import { TollMatcherService, MatchTollsOptions } from './toll-matcher.service';
import { TollCostService, TollRateResolution } from './toll-cost.service';

export interface TollListFilter {
  highway?: string;
  vehicleType?: VehicleType;
  operator?: string;
}

export class TollsService {
  private matcher: TollMatcherService;
  private costService: TollCostService;

  constructor(matcher?: TollMatcherService, costService?: TollCostService) {
    this.costService = costService || new TollCostService();
    this.matcher = matcher || new TollMatcherService(this.costService);
  }

  public async listTolls(filter: TollListFilter = {}): Promise<any[]> {
    try {
      const pool = getDbPool();
      const vehicleType = filter.vehicleType || 'automovil';

      let query = `
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
          tp.created_at,
          tp.updated_at,
          tr.cash_price,
          tr.electronic_price,
          tr.currency,
          tr.effective_from,
          tr.effective_until,
          tr.last_verified_at
        FROM toll_plazas tp
        LEFT JOIN toll_rates tr ON tr.toll_plaza_id = tp.id AND tr.vehicle_type = $1
        WHERE 1=1
      `;

      const params: any[] = [vehicleType];
      let paramIdx = 2;

      if (filter.highway) {
        query += ` AND (tp.highway ILIKE $${paramIdx} OR tp.road ILIKE $${paramIdx})`;
        params.push(`%${filter.highway}%`);
        paramIdx++;
      }

      if (filter.operator) {
        query += ` AND tp.operator ILIKE $${paramIdx}`;
        params.push(`%${filter.operator}%`);
        paramIdx++;
      }

      query += ` ORDER BY tp.highway ASC, tp.name ASC;`;

      const res = await pool.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        operator: row.operator,
        highway: row.highway,
        road: row.road,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        direction: row.direction,
        kmMarker: row.km_marker ? Number(row.km_marker) : undefined,
        cashPrice: row.cash_price !== null ? Number(row.cash_price) : null,
        electronicPrice: row.electronic_price !== null ? Number(row.electronic_price) : null,
        currency: row.currency || 'MXN',
        priceStatus: this.costService.evaluatePriceStatus({
          cashPrice: row.cash_price,
          electronicPrice: row.electronic_price,
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until,
          lastVerifiedAt: row.last_verified_at,
        }),
      }));
    } catch {
      // Fallback local list
      return this.matcher.matchInMemory([[ -99.9328, 20.3069 ]]).map((e) => ({
        id: e.tollPlazaId,
        name: e.name,
        operator: e.operator,
        highway: e.highway,
        latitude: e.latitude,
        longitude: e.longitude,
        cashPrice: e.price,
        electronicPrice: e.price,
        currency: 'MXN',
        priceStatus: e.priceStatus,
      }));
    }
  }

  public async getTollById(id: string, vehicleType: VehicleType = 'automovil'): Promise<any | null> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`
        SELECT
          tp.*,
          tr.cash_price,
          tr.electronic_price,
          tr.currency,
          tr.effective_from,
          tr.effective_until,
          tr.last_verified_at,
          ds.name as source_name,
          ds.code as source_code
        FROM toll_plazas tp
        LEFT JOIN toll_rates tr ON tr.toll_plaza_id = tp.id AND tr.vehicle_type = $2
        LEFT JOIN data_sources ds ON ds.id = tp.source_id
        WHERE tp.id = $1;
      `, [id, vehicleType]);

      if (res.rows.length === 0) {
        return null;
      }

      const row = res.rows[0];
      return {
        id: row.id,
        name: row.name,
        operator: row.operator,
        highway: row.highway,
        road: row.road,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        direction: row.direction,
        kmMarker: row.km_marker ? Number(row.km_marker) : undefined,
        cashPrice: row.cash_price !== null ? Number(row.cash_price) : null,
        electronicPrice: row.electronic_price !== null ? Number(row.electronic_price) : null,
        currency: row.currency || 'MXN',
        priceStatus: this.costService.evaluatePriceStatus({
          cashPrice: row.cash_price,
          electronicPrice: row.electronic_price,
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until,
          lastVerifiedAt: row.last_verified_at,
        }),
        source: row.source_name ? { name: row.source_name, code: row.source_code } : undefined,
      };
    } catch {
      return null;
    }
  }

  public async findTollsAlongPoints(
    points: [number, number][],
    optionsOrBuffer?: MatchTollsOptions | number
  ): Promise<TollEvent[]> {
    const options: MatchTollsOptions = typeof optionsOrBuffer === 'number'
      ? { radiusMeters: optionsOrBuffer }
      : (optionsOrBuffer || {});

    return await this.matcher.matchTollsAlongRoute(points, options);
  }
}
