import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TollMatcherService } from '../src/modules/tolls/toll-matcher.service';
import { TollCostService } from '../src/modules/tolls/toll-cost.service';
import { FuelCostService } from '../src/modules/routing/services/fuel-cost.service';
import { TimeCostService } from '../src/modules/routing/services/time-cost.service';

describe('Real OSRM Route Processing & Toll Detection (Offline Reproducible Test)', () => {
  const matcher = new TollMatcherService();
  const tollCostService = new TollCostService();
  const fuelCostService = new FuelCostService();
  const timeCostService = new TimeCostService();

  // Cargar payload real capturado de OSRM
  const fixturePath = path.resolve(__dirname, '../src/fixtures/routing/osrm-real-queretaro-cdmx.json');
  const rawOsrm = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const realRoute = rawOsrm.routes[0];

  it('Verifies real OSRM route metrics and step structure', () => {
    expect(realRoute.distanceMeters).toBe(218507); // 218.5 km
    expect(realRoute.durationSeconds).toBe(10112);  // 2h 48m 32s
    expect(realRoute.geometry.coordinates.length).toBe(2067);

    const steps = realRoute.legs.flatMap((l: any) => l.steps || []);
    expect(steps.length).toBe(26);

    const stepNames = steps.map((s: any) => s.name);
    expect(stepNames).toContain('Carretera México - Querétaro (Cuota)');
    expect(stepNames).toContain('Boulevard Manuel Ávila Camacho');
    expect(stepNames).toContain('Plaza de la Constitución');
  });

  it('Accurately detects Palmillas and Tepotzotlán on MEX-057D and rejects false positives', async () => {
    const coords = realRoute.geometry.coordinates;
    const steps = realRoute.legs.flatMap((l: any) => l.steps || []);
    const highwayHints = Array.from(new Set(steps.map((s: any) => s.name).filter(Boolean))) as string[];

    const matchedTolls = await matcher.matchTollsAlongRoute(coords, {
      radiusMeters: 250,
      vehicleType: 'automovil',
      highwayHints,
    });

    expect(matchedTolls.length).toBe(2);

    // 1. Caseta Palmillas
    const palmillas = matchedTolls[0];
    expect(palmillas.name).toContain('Palmillas');
    expect(palmillas.highway).toBe('MEX-057D');
    expect(palmillas.operator).toBe('CAPUFE');
    expect(palmillas.price).toBe(108.0);
    expect(palmillas.priceStatus).toBe('VALID');
    expect(palmillas.routePosition).toBeGreaterThan(0.2);
    expect(palmillas.routePosition).toBeLessThan(0.4); // ~26%

    // 2. Caseta Tepotzotlán
    const tepotzotlan = matchedTolls[1];
    expect(tepotzotlan.name).toContain('Tepotzotlán');
    expect(tepotzotlan.highway).toBe('MEX-057D');
    expect(tepotzotlan.operator).toBe('CAPUFE');
    expect(tepotzotlan.price).toBe(108.0);
    expect(tepotzotlan.priceStatus).toBe('VALID');
    expect(tepotzotlan.routePosition).toBeGreaterThan(palmillas.routePosition);
    expect(tepotzotlan.routePosition).toBeLessThan(0.7); // ~59%

    // Verificación de exclusión de carreteras no transitadas
    const celaya = matchedTolls.find((t) => t.name.includes('Celaya'));
    expect(celaya).toBeUndefined(); // MEX-045D excluida

    const sanMarcos = matchedTolls.find((t) => t.name.includes('San Marcos'));
    expect(sanMarcos).toBeUndefined(); // MEX-150D excluida

    const puertoMexico = matchedTolls.find((t) => t.name.includes('Puerto México'));
    expect(puertoMexico).toBeUndefined(); // Querétaro-SLP excluida
  });

  it('Calculates exact financial breakdown for the real OSRM route', async () => {
    const coords = realRoute.geometry.coordinates;
    const steps = realRoute.legs.flatMap((l: any) => l.steps || []);
    const highwayHints = Array.from(new Set(steps.map((s: any) => s.name).filter(Boolean))) as string[];

    const matchedTolls = await matcher.matchTollsAlongRoute(coords, {
      radiusMeters: 250,
      vehicleType: 'automovil',
      highwayHints,
    });

    const tollSummary = tollCostService.calculateSummary(matchedTolls);
    const fuel = fuelCostService.calculate(realRoute.distanceMeters, 14.5, 24.50);
    const time = timeCostService.calculate(realRoute.durationSeconds, 120.0);

    expect(tollSummary.totalCashCost).toBe(216.0); // 108 + 108
    expect(tollSummary.hasUnknownPrices).toBe(false);
    expect(tollSummary.hasOutdatedPrices).toBe(false);

    expect(fuel.fuelCost).toBe(369.2); // (218.507 / 14.5) * 24.50
    expect(fuel.litersUsed).toBe(15.07);

    expect(time.timeCost).toBe(337.07); // (10112 / 3600) * 120

    const directCost = Math.round((fuel.fuelCost + tollSummary.totalCashCost) * 100) / 100;
    expect(directCost).toBe(585.2);

    const generalizedCost = Math.round((directCost + time.timeCost) * 100) / 100;
    expect(generalizedCost).toBe(922.27);
  });
});
