process.env.ROUTING_PROVIDER = 'mock';
process.env.GEOCODING_PROVIDER = 'mock';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';
import { InegiLiveSyncService } from '../src/modules/tolls/inegi-live-sync.service';
import { TollEvent } from '@routewise/types';

describe('RouteWise End-to-End Validation: Caso A & Caso B', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('Caso A: Querétaro ➔ Ciudad de México (MEX-057D con Palmillas y Tepotzotlán)', async () => {
    const palmillasToll: TollEvent = {
      id: 'toll-palmillas',
      tollPlazaId: 'plaza-palmillas',
      name: 'Caseta Palmillas',
      highway: 'MEX-057D',
      operator: 'CAPUFE',
      latitude: 20.3069,
      longitude: -99.9349,
      price: 108.0,
      priceStatus: 'VALID',
      routePosition: 0.35,
    };

    const tepotzotlanToll: TollEvent = {
      id: 'toll-tepotzotlan',
      tollPlazaId: 'plaza-tepotzotlan',
      name: 'Caseta Tepotzotlán',
      highway: 'MEX-057D',
      operator: 'CAPUFE',
      latitude: 19.7144,
      longitude: -99.2075,
      price: 108.0,
      priceStatus: 'VALID',
      routePosition: 0.85,
    };

    vi.spyOn(InegiLiveSyncService.prototype, 'syncLiveTariffs').mockResolvedValueOnce({
      liveTollsFound: 2,
      cuotaTollsFound: 2,
      libreTollsFound: 0,
      cuotaEvents: [palmillasToll, tepotzotlanToll],
      libreEvents: [], // SAKBÉ confirma directamente ruta libre sin peajes (CONFIRMED_NO_TOLL)
      updatedPrices: new Map([
        ['Caseta Palmillas', 108.0],
        ['Caseta Tepotzotlán', 108.0],
      ]),
      totalCuotaCost: 216.0,
      totalLibreCost: 0,
    });
    const payload = {
      origin: {
        latitude: 20.5888,
        longitude: -100.3899,
        label: 'Santiago de Querétaro, QRO',
      },
      destination: {
        latitude: 19.4326,
        longitude: -99.1332,
        label: 'Ciudad de México, CDMX',
      },
      vehicle: {
        fuelConsumption: 14.5,
        fuelPrice: 24.50,
        vehicleType: 'automovil',
      },
      preferences: {
        mode: 'BALANCED',
        timeValue: 120,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/calculate',
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.searchId).toBeDefined();
    expect(body.routes).toBeInstanceOf(Array);
    expect(body.routes.length).toBeGreaterThanOrEqual(2);

    // 1. Ruta rápida (Autopista Completa 57D)
    const fastRoute = body.routes.find((r: any) => r.type === 'FAST' || r.tolls.length === 2);
    expect(fastRoute).toBeDefined();

    // Verificaciones métricas
    expect(fastRoute.distanceMeters).toBeGreaterThan(200000); // ~218.5 km
    expect(fastRoute.durationSeconds).toBeGreaterThan(7000);  // ~2h 45m
    expect(fastRoute.geometry).toBeDefined();

    // Verificación de casetas (2 TollEvents: Palmillas y Tepotzotlán)
    expect(fastRoute.tolls.length).toBe(2);

    // Caseta 1: Palmillas
    const toll1 = fastRoute.tolls[0];
    expect(toll1.name).toContain('Palmillas');
    expect(toll1.highway).toBe('MEX-057D');
    expect(toll1.price).toBe(108.0);
    expect(toll1.priceStatus).toBe('VALID');
    expect(toll1.routePosition).toBeGreaterThan(0.2);
    expect(toll1.routePosition).toBeLessThan(0.6);

    // Caseta 2: Tepotzotlán
    const toll2 = fastRoute.tolls[1];
    expect(toll2.name).toContain('Tepotzotlán');
    expect(toll2.highway).toBe('MEX-057D');
    expect(toll2.price).toBe(108.0);
    expect(toll2.priceStatus).toBe('VALID');
    expect(toll2.routePosition).toBeGreaterThan(toll1.routePosition);

    // Verificación de desglose de costos
    const cost = fastRoute.cost;
    expect(cost.fuel).toBeGreaterThan(300); // ~$369.19
    expect(cost.tolls).toBe(216.0);        // $108 + $108
    expect(cost.direct).toBe(cost.fuel + cost.tolls);
    expect(cost.time).toBeGreaterThan(200); // (9900/3600)*120 = $330
    expect(cost.generalized).toBe(Math.round((cost.direct + cost.time) * 100) / 100);
    expect(cost.hasUnknownTolls).toBe(false);

    // Verificación de comparaciones y explicaciones en español
    expect(fastRoute.explanation.headline).toBeDefined();
    expect(fastRoute.explanation.description).toBeDefined();
    expect(fastRoute.explanation.badge).toBeDefined();
    expect(fastRoute.comparison).toBeDefined();

    // 2. Ruta libre (Sin casetas)
    const freeRoute = body.routes.find((r: any) => r.type === 'NO_TOLL' || r.tollCost === 0);
    expect(freeRoute).toBeDefined();
    expect(freeRoute.tolls.length).toBe(0);
    expect(freeRoute.cost.tolls).toBe(0);
    expect(freeRoute.durationSeconds).toBeGreaterThan(fastRoute.durationSeconds);
  });

  it('Caso B: Querétaro ➔ San Luis Potosí (MEX-057D con Caseta Puerto México)', async () => {
    const puertoMexicoToll: TollEvent = {
      id: 'toll-puerto-mexico',
      tollPlazaId: 'plaza-puerto-mexico',
      name: 'Caseta Puerto México',
      highway: 'MEX-057D',
      operator: 'CAPUFE',
      latitude: 21.0500,
      longitude: -100.5000,
      price: 145.0,
      priceStatus: 'VALID',
      routePosition: 0.5,
    };

    vi.spyOn(InegiLiveSyncService.prototype, 'syncLiveTariffs').mockResolvedValueOnce({
      liveTollsFound: 1,
      cuotaTollsFound: 1,
      libreTollsFound: 0,
      cuotaEvents: [puertoMexicoToll],
      libreEvents: [], // SAKBÉ confirma directamente ruta libre sin peajes (CONFIRMED_NO_TOLL)
      updatedPrices: new Map([['Caseta Puerto México', 145.0]]),
      totalCuotaCost: 145.0,
      totalLibreCost: 0,
    });

    const payload = {
      origin: {
        latitude: 20.5888,
        longitude: -100.3899,
        label: 'Santiago de Querétaro, QRO',
      },
      destination: {
        latitude: 22.1565,
        longitude: -100.9855,
        label: 'San Luis Potosí, SLP',
      },
      vehicle: {
        fuelConsumption: 14.5,
        fuelPrice: 24.50,
        vehicleType: 'automovil',
      },
      preferences: {
        mode: 'BALANCED',
        timeValue: 120,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/calculate',
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.searchId).toBeDefined();
    expect(body.routes).toBeInstanceOf(Array);
    expect(body.routes.length).toBeGreaterThanOrEqual(2);

    // 1. Ruta rápida (Autopista Cuota 57D)
    const fastRoute = body.routes.find((r: any) => r.tolls && r.tolls.length > 0);
    expect(fastRoute).toBeDefined();
    expect(fastRoute.distanceMeters).toBeGreaterThan(190000); // ~203 km
    expect(fastRoute.durationSeconds).toBeGreaterThan(7000);  // ~2h 10m

    // Verificación de caseta Puerto México
    expect(fastRoute.tolls.length).toBe(1);
    const toll = fastRoute.tolls[0];
    expect(toll.name).toContain('Puerto México');
    expect(toll.highway).toBe('MEX-057D');
    expect(toll.price).toBe(145.0);
    expect(toll.priceStatus).toBe('VALID');
    expect(toll.routePosition).toBeGreaterThan(0.2);
    expect(toll.routePosition).toBeLessThan(0.8);

    // Costos
    expect(fastRoute.cost.tolls).toBe(145.0);
    expect(fastRoute.cost.direct).toBe(fastRoute.cost.fuel + 145.0);
    expect(fastRoute.cost.hasUnknownTolls).toBe(false);

    // 2. Ruta económica libre (Carretera Libre 57)
    const cheapRoute = body.routes.find((r: any) => r.type === 'NO_TOLL' || r.tollCost === 0);
    expect(cheapRoute).toBeDefined();
    expect(cheapRoute.tolls.length).toBe(0);
    expect(cheapRoute.cost.tolls).toBe(0);
    expect(cheapRoute.durationSeconds).toBeGreaterThan(fastRoute.durationSeconds);

    // Comparación entre alternativas
    expect(fastRoute.comparison?.vsCheapest?.minutesSaved).toBeGreaterThan(0);
  });
});
