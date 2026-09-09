import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';

describe('Geocoding Search API Endpoint (GET /api/v1/geocoding/search)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects query parameters with q length < 2', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/geocoding/search?q=a',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Invalid query parameters');
  });

  it('returns valid search results for Mexican query "Querétaro"', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/geocoding/search?q=Querétaro',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);

    const first = body.results[0];
    expect(first.displayName).toBeDefined();
    expect(first.latitude).toBeTypeOf('number');
    expect(first.longitude).toBeTypeOf('number');
  });

  it('respects limit query parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/geocoding/search?q=México&limit=2',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results.length).toBeLessThanOrEqual(2);
  });
});
