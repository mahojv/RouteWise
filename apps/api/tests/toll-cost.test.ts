import { describe, it, expect } from 'vitest';
import { TollCostService } from '../src/modules/tolls/toll-cost.service';
import { TollEvent } from '@routewise/types';

describe('TollCostService Unit Tests', () => {
  const service = new TollCostService();

  it('Evaluates VALID price status for active recent rates', () => {
    const status = service.evaluatePriceStatus({
      cashPrice: 108.0,
      lastVerifiedAt: new Date(),
      effectiveUntil: new Date(Date.now() + 1000 * 3600 * 24 * 30),
    });
    expect(status).toBe('VALID');
  });

  it('Evaluates OUTDATED price status if past effectiveUntil date', () => {
    const status = service.evaluatePriceStatus({
      cashPrice: 95.0,
      effectiveUntil: new Date('2020-01-01'),
    });
    expect(status).toBe('OUTDATED');
  });

  it('Evaluates OUTDATED price status if verified more than 1 year ago', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const status = service.evaluatePriceStatus({
      cashPrice: 145.0,
      lastVerifiedAt: twoYearsAgo,
    });
    expect(status).toBe('OUTDATED');
  });

  it('Evaluates UNKNOWN price status if rate is missing or null', () => {
    const status = service.evaluatePriceStatus(undefined);
    expect(status).toBe('UNKNOWN');
  });

  it('Preserves UNKNOWN state and flags hasUnknownPrices without assuming $0', () => {
    const events: TollEvent[] = [
      {
        id: 'evt-1',
        tollPlazaId: 'p-1',
        name: 'Caseta Palmillas',
        latitude: 20.3069,
        longitude: -99.9328,
        price: 108.0,
        priceStatus: 'VALID',
        routePosition: 0.25,
      },
      {
        id: 'evt-2',
        tollPlazaId: 'p-2',
        name: 'Caseta Desconocida',
        latitude: 20.0,
        longitude: -99.5,
        price: null,
        priceStatus: 'UNKNOWN',
        routePosition: 0.5,
      },
      {
        id: 'evt-3',
        tollPlazaId: 'p-3',
        name: 'Caseta Antigua',
        latitude: 19.7,
        longitude: -99.2,
        price: 100.0,
        priceStatus: 'OUTDATED',
        routePosition: 0.75,
      },
    ];

    const summary = service.calculateSummary(events);
    expect(summary.totalCashCost).toBe(208.0); // 108 + 100
    expect(summary.hasUnknownPrices).toBe(true);
    expect(summary.hasOutdatedPrices).toBe(true);
    expect(summary.unknownCount).toBe(1);
    expect(summary.outdatedCount).toBe(1);
  });
});
