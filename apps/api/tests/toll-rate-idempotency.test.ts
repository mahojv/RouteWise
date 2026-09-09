import { describe, it, expect } from 'vitest';
import { TollMatcherService } from '../src/modules/tolls/toll-matcher.service';
import { TollCostService } from '../src/modules/tolls/toll-cost.service';
import { TollEvent } from '@routewise/types';

describe('Toll Rate Idempotency & De-duplication Tests', () => {
  const matcher = new TollMatcherService();
  const costService = new TollCostService();

  const queretaroCdmxCoords: [number, number][] = [
    [-100.3899, 20.5888], // Querétaro
    [-99.9349, 20.3069],  // Caseta Palmillas
    [-99.5000, 20.0000],  // Tramo intermedio 57D
    [-99.2075, 19.7144],  // Caseta Tepotzotlán
    [-99.1332, 19.4326],  // CDMX
  ];

  it('Consistently yields exactly $216 MXN on repeated consecutive searches (Invariant Costs)', async () => {
    // Consulta 1
    const events1 = await matcher.matchTollsAlongRoute(queretaroCdmxCoords);
    const summary1 = costService.calculateSummary(events1);

    // Consulta 2
    const events2 = await matcher.matchTollsAlongRoute(queretaroCdmxCoords);
    const summary2 = costService.calculateSummary(events2);

    // Consulta 3
    const events3 = await matcher.matchTollsAlongRoute(queretaroCdmxCoords);
    const summary3 = costService.calculateSummary(events3);

    // Validación Consulta 1
    expect(events1.length).toBe(2);
    expect(summary1.totalCashCost).toBe(216);

    // Validación Consulta 2 (NO debe duplicar ni sumar $432)
    expect(events2.length).toBe(2);
    expect(summary2.totalCashCost).toBe(216);

    // Validación Consulta 3 (NO debe triplicar ni sumar $648)
    expect(events3.length).toBe(2);
    expect(summary3.totalCashCost).toBe(216);

    // Casetas identificadas
    const names1 = events1.map((e) => e.name);
    expect(names1.some((n) => n.includes('Palmillas'))).toBe(true);
    expect(names1.some((n) => n.includes('Tepotzotlán'))).toBe(true);
  });

  it('Guarantees exactly 1 toll event per physical toll plaza even with duplicate coordinate crossings', () => {
    // Coordenadas con repetición de puntos cerca de la misma caseta
    const loopCoords: [number, number][] = [
      [-100.3899, 20.5888],
      [-99.9349, 20.3069],  // Palmillas paso 1
      [-99.9350, 20.3070],  // Palmillas paso 2
      [-99.9348, 20.3068],  // Palmillas paso 3
      [-99.2075, 19.7144],  // Tepotzotlán paso 1
      [-99.2076, 19.7145],  // Tepotzotlán paso 2
      [-99.1332, 19.4326],
    ];

    const events = matcher.matchInMemory(loopCoords);
    const palmillasEvents = events.filter((e) => e.name.toLowerCase().includes('palmillas'));
    const tepotzotlanEvents = events.filter((e) => e.name.toLowerCase().includes('tepotzotlán'));

    expect(palmillasEvents.length).toBe(1);
    expect(tepotzotlanEvents.length).toBe(1);

    const summary = costService.calculateSummary(events);
    expect(summary.totalCashCost).toBe(216);
  });

  it('Validates in-memory rate map uniqueness and idempotent price updates', () => {
    // Simulación de la estructura de tarifas por (toll_plaza_id, vehicle_type)
    const rateStore = new Map<string, { price: number; updatedAt: Date }>();

    const upsertRate = (plazaId: string, vehicleType: string, price: number) => {
      const key = `${plazaId}:${vehicleType}`;
      rateStore.set(key, { price, updatedAt: new Date() });
    };

    // Sincronización 1
    upsertRate('plaza-palmillas', 'automovil', 108);
    upsertRate('plaza-tepotzotlan', 'automovil', 108);
    expect(rateStore.size).toBe(2);

    // Sincronización 2 (mismos IDs)
    upsertRate('plaza-palmillas', 'automovil', 108);
    upsertRate('plaza-tepotzotlan', 'automovil', 108);
    expect(rateStore.size).toBe(2);

    // Sincronización 3 (actualización de tarifa)
    upsertRate('plaza-palmillas', 'automovil', 110);
    expect(rateStore.size).toBe(2);
    expect(rateStore.get('plaza-palmillas:automovil')?.price).toBe(110);
  });
});
