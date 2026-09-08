process.env.ROUTING_PROVIDER = 'mock';
process.env.GEOCODING_PROVIDER = 'mock';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('API Route Calculation Endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/routes/calculate returns optimized routes with cost breakdown and TollEvents', async () => {
    const payload = {
      origin: {
        latitude: 20.5888,
        longitude: -100.3899,
        label: 'Santiago de Querétaro',
      },
      destination: {
        latitude: 19.4326,
        longitude: -99.1332,
        label: 'Ciudad de México',
      },
      vehicle: {
        fuelConsumption: 14.5,
        fuelPrice: 24.5,
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

    if (response.statusCode !== 200) {
      console.error('500 ERROR BODY:', response.body);
    }
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.searchId).toBeDefined();
    expect(body.routes).toBeInstanceOf(Array);
    expect(body.routes.length).toBeGreaterThan(0);

    const firstRoute = body.routes[0];
    expect(firstRoute.totalCost).toBeGreaterThan(0);
    expect(firstRoute.cost).toBeDefined();
    expect(firstRoute.cost.fuel).toBeGreaterThan(0);
    expect(firstRoute.cost.direct).toBeGreaterThan(0);
    expect(firstRoute.cost.generalized).toBeGreaterThan(0);
    expect(firstRoute.tolls).toBeInstanceOf(Array);
    expect(firstRoute.explanation).toBeDefined();
    expect(firstRoute.explanation.headline).toBeDefined();
  });

  it('Rejects invalid coordinates with HTTP 400', async () => {
    const invalidPayload = {
      origin: {
        latitude: 190.0,
        longitude: -100.3899,
      },
      destination: {
        latitude: 19.4326,
        longitude: -99.1332,
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/calculate',
      payload: invalidPayload,
    });

    expect(response.statusCode).toBe(400);
  });
});
