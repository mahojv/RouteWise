import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('API Health Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status and service checks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.version).toBe('0.1.0');
    expect(body.services).toBeDefined();
    expect(body.services.routing).toBeDefined();
  });

  it('GET /api/v1/health returns 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBeDefined();
  });

  it('GET /api/v1/vehicles returns vehicle presets', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/vehicles',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.vehicles.length).toBeGreaterThan(0);
    expect(body.vehicles[0].fuelConsumption).toBeGreaterThan(0);
  });
});
