import { VehicleType, TollPriceStatus, TollEvent } from '@routewise/types';
import { getDbPool } from '../../database';

export interface TollRateResolution {
  tollPlazaId: string;
  vehicleType: VehicleType;
  cashPrice: number;
  electronicPrice: number;
  currency: string;
  priceStatus: TollPriceStatus;
  effectiveFrom?: string;
  effectiveUntil?: string;
  lastVerifiedAt?: string;
  isOutdated: boolean;
  isUnknown: boolean;
}

export interface TollCostCalculationSummary {
  totalCashCost: number;
  totalElectronicCost: number;
  events: TollEvent[];
  hasUnknownPrices: boolean;
  hasOutdatedPrices: boolean;
  unknownCount: number;
  outdatedCount: number;
}

export class TollCostService {
  /**
   * Resuelve el estado de vigencia de una tarifa
   */
  public evaluatePriceStatus(rate?: {
    cashPrice: number;
    electronicPrice?: number;
    effectiveFrom?: Date | string | null;
    effectiveUntil?: Date | string | null;
    lastVerifiedAt?: Date | string | null;
  }): TollPriceStatus {
    if (!rate || rate.cashPrice === undefined || rate.cashPrice === null) {
      return 'UNKNOWN';
    }

    const now = new Date();

    if (rate.effectiveUntil) {
      const until = new Date(rate.effectiveUntil);
      if (now > until) {
        return 'OUTDATED';
      }
    }

    if (rate.lastVerifiedAt) {
      const verified = new Date(rate.lastVerifiedAt);
      const diffDays = (now.getTime() - verified.getTime()) / (1000 * 3600 * 24);
      if (diffDays > 365) {
        return 'OUTDATED';
      }
    }

    return 'VALID';
  }

  /**
   * Obtiene la tarifa desde la base de datos para una caseta y tipo de vehículo
   */
  public async getRateForPlaza(
    tollPlazaId: string,
    vehicleType: VehicleType = 'automovil'
  ): Promise<TollRateResolution> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`
        SELECT tr.*, tp.name as plaza_name
        FROM toll_rates tr
        JOIN toll_plazas tp ON tp.id = tr.toll_plaza_id
        WHERE tr.toll_plaza_id = $1 AND tr.vehicle_type = $2
        ORDER BY tr.last_verified_at DESC
        LIMIT 1;
      `, [tollPlazaId, vehicleType]);

      if (res.rows.length === 0) {
        return {
          tollPlazaId,
          vehicleType,
          cashPrice: 0,
          electronicPrice: 0,
          currency: 'MXN',
          priceStatus: 'UNKNOWN',
          isOutdated: false,
          isUnknown: true,
        };
      }

      const row = res.rows[0];
      const status = this.evaluatePriceStatus({
        cashPrice: row.cash_price,
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        lastVerifiedAt: row.last_verified_at,
      });

      return {
        tollPlazaId,
        vehicleType,
        cashPrice: Number(row.cash_price) || 0,
        electronicPrice: Number(row.electronic_price ?? row.cash_price) || 0,
        currency: row.currency || 'MXN',
        priceStatus: status,
        effectiveFrom: row.effective_from ? new Date(row.effective_from).toISOString() : undefined,
        effectiveUntil: row.effective_until ? new Date(row.effective_until).toISOString() : undefined,
        lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : undefined,
        isOutdated: status === 'OUTDATED',
        isUnknown: status === 'UNKNOWN',
      };
    } catch {
      return {
        tollPlazaId,
        vehicleType,
        cashPrice: 0,
        electronicPrice: 0,
        currency: 'MXN',
        priceStatus: 'UNKNOWN',
        isOutdated: false,
        isUnknown: true,
      };
    }
  }

  /**
   * Calcula el resumen de costos para una lista de casetas identificadas (TollEvents)
   */
  public calculateSummary(events: TollEvent[]): TollCostCalculationSummary {
    let totalCashCost = 0;
    let totalElectronicCost = 0;
    let unknownCount = 0;
    let outdatedCount = 0;

    for (const evt of events) {
      if (evt.priceStatus === 'UNKNOWN') {
        unknownCount++;
        // UNKNOWN nunca debe asumirse $0 silenciosamente
      } else {
        totalCashCost += evt.price ?? 0;
        totalElectronicCost += evt.price ?? 0;
        if (evt.priceStatus === 'OUTDATED') {
          outdatedCount++;
        }
      }
    }

    return {
      totalCashCost: Math.round(totalCashCost * 100) / 100,
      totalElectronicCost: Math.round(totalElectronicCost * 100) / 100,
      events,
      hasUnknownPrices: unknownCount > 0,
      hasOutdatedPrices: outdatedCount > 0,
      unknownCount,
      outdatedCount,
    };
  }
}
