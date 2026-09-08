import { describe, it, expect } from 'vitest';
import { FuelCostService } from '../src/modules/routing/services/fuel-cost.service';
import { TimeCostService } from '../src/modules/routing/services/time-cost.service';

describe('Fuel and Time Cost Calculation Services', () => {
  const fuelService = new FuelCostService();
  const timeService = new TimeCostService();

  it('Calculates fuel volume and cost accurately', () => {
    // 210,000 meters (210 km) with 14.0 km/L at $24.50/L
    // Liters: 210 / 14 = 15.0 L
    // Cost: 15.0 * 24.50 = 367.50 MXN
    const res = fuelService.calculate(210000, 14.0, 24.50);
    expect(res.litersUsed).toBe(15.0);
    expect(res.fuelCost).toBe(367.5);
  });

  it('Calculates time cost accurately based on hourly valuation', () => {
    // 7200 seconds (2.0 hours) at $150 MXN/hr
    // Cost: 2.0 * 150 = 300.0 MXN
    const res = timeService.calculate(7200, 150.0);
    expect(res.durationHours).toBe(2.0);
    expect(res.timeCost).toBe(300.0);
  });
});
