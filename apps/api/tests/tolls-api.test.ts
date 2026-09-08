process.env.ROUTING_PROVIDER = 'mock';
process.env.GEOCODING_PROVIDER = 'mock';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('Tolls API Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/tolls returns list of toll plazas', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tolls',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tolls).toBeInstanceOf(Array);
  });

  it('GET /api/v1/tolls supports highway filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/tolls?highway=MEX-057D',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.tolls).toBeInstanceOf(Array);
  });
});
