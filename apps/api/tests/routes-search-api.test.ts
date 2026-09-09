import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/server';
import { FastifyInstance } from 'fastify';
import { RoutingProvider, RoutingRequest, RoutingResponse } from '@routewise/routing';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import { TollBypassResolverService } from '../src/modules/tolls/toll-bypass-resolver.service';
import { FIXTURE_CURATED_BYPASSES } from '../src/fixtures/bypasses.fixture';

class TestMockRoutingProvider implements RoutingProvider {
  public readonly name = 'test-search-provider';
  public callCount = 0;

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    this.callCount++;

    const isHybridCall = request.waypoints && request.waypoints.length === 2 && request.waypoints[1].latitude === 20.245;
    const isFreeCall = request.waypoints && request.waypoints.length >= 1 && !isHybridCall;

    if (isHybridCall) {
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 230460,
            durationSeconds: 12102,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.6521, 20.3742],
                [-99.5850, 20.2450],
                [-99.1332, 19.4326],
              ],
            },
            legs: [
              {
                distanceMeters: 230460,
                durationSeconds: 12102,
                steps: [
                  { name: 'Carretera Libre 45', distanceMeters: 50000, durationSeconds: 3000, mode: 'driving', geometry: [] },
                  { name: 'Autopista México - Querétaro (Cuota)', distanceMeters: 180460, durationSeconds: 9102, mode: 'driving', isToll: true, geometry: [] },
                ],
              },
            ],
          },
        ],
      };
    }

    if (isFreeCall) {
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 267020,
            durationSeconds: 14754,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.6521, 20.3742],
                [-99.1650, 19.7480],
                [-99.1332, 19.4326],
              ],
            },
            legs: [
              {
                distanceMeters: 267020,
                durationSeconds: 14754,
                steps: [
                  { name: 'Carretera Libre Huichapan', distanceMeters: 267020, durationSeconds: 14754, mode: 'driving', geometry: [] },
                ],
              },
            ],
          },
        ],
      };
    }

    // FAST Base
    return {
      provider: this.name,
      latencyMs: 5,
      routes: [
        {
          distanceMeters: 212150,
          durationSeconds: 10092,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-100.3899, 20.5888],
              [-99.9349, 20.3069], // Palmillas
              [-99.2075, 19.7144], // Tepotzotlán
              [-99.1332, 19.4326],
            ],
          },
          legs: [
            {
              distanceMeters: 212150,
              durationSeconds: 10092,
              steps: [
                { name: 'Carretera México - Querétaro (Cuota)', distanceMeters: 212150, durationSeconds: 10092, mode: 'driving', isToll: true, geometry: [] },
              ],
            },
          ],
        },
      ],
    };
  }

  public async checkHealth() {
    return { status: 'ok' as const, latencyMs: 1 };
  }
}

describe('POST /api/v1/routes/search API Endpoint Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer();
  });

  afterEach(async () => {
    await app.close();
  });

  it('Test 1: Valid request returns 200 OK with formatted RouteCalculationResponse', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/search',
      payload: {
        origin: { latitude: 20.5888, longitude: -100.3899, label: 'Querétaro' },
        destination: { latitude: 19.4326, longitude: -99.1332, label: 'CDMX' },
        vehicle: {
          type: 'automovil',
          fuelType: 'gasolina_regular',
          fuelEfficiencyKmPerLiter: 14.5,
          fuelPricePerLiter: 24.50,
        },
        preferences: {
          strategy: 'BALANCED',
          timeValue: 120,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.searchId).toBeDefined();
    expect(body.recommendedRouteId).toBeDefined();
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThanOrEqual(1);

    // Verify GeoJSON geometry object (not string)
    const firstRoute = body.routes[0];
    expect(typeof firstRoute.geometry).toBe('object');
    expect(firstRoute.geometry.type).toBe('LineString');
    expect(Array.isArray(firstRoute.geometry.coordinates)).toBe(true);
    expect(firstRoute.distanceKm).toBeDefined();
    expect(firstRoute.durationMinutes).toBeDefined();
  });

  it('Test 2: Invalid coordinates return 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/search',
      payload: {
        origin: { latitude: 120.0, longitude: -100.3899 }, // Out of range lat
        destination: { latitude: 19.4326, longitude: -99.1332 },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Bad Request');
  });

  it('Test 3: Invalid vehicle type returns 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/search',
      payload: {
        origin: { latitude: 20.5888, longitude: -100.3899 },
        destination: { latitude: 19.4326, longitude: -99.1332 },
        vehicle: {
          type: 'submarino_nuclear', // Invalid
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Bad Request');
  });

  it('Test 4: Invalid preference strategy returns 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/search',
      payload: {
        origin: { latitude: 20.5888, longitude: -100.3899 },
        destination: { latitude: 19.4326, longitude: -99.1332 },
        preferences: {
          strategy: 'ULTRA_FAST', // Invalid
        },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Bad Request');
  });

  it('Test 5 & 8: Engine returns valid routes and respects <= 5 OSRM call budget', async () => {
    const mockProvider = new TestMockRoutingProvider();
    const mockOptimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new TollBypassResolverService(FIXTURE_CURATED_BYPASSES),
      undefined,
      undefined,
      mockProvider
    );

    const calcRes = await mockOptimizer.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    expect(mockProvider.callCount).toBeLessThanOrEqual(5);
    expect(calcRes.routes.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 6: Endpoint does NOT expose internal OSRM or SQL details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/search',
      payload: {
        origin: { latitude: 20.5888, longitude: -100.3899 },
        destination: { latitude: 19.4326, longitude: -99.1332 },
      },
    });

    const text = res.payload;
    expect(text).not.toContain('osrm');
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('ST_DWithin');
    expect(text).not.toContain('LINESTRING');
  });

  it('Test 7: Unexpected error transforms to clean HTTP error without leaking stack trace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/routes/search',
      payload: {
        origin: { latitude: 'invalid_lat' as any, longitude: -100.3899 },
        destination: { latitude: 19.4326, longitude: -99.1332 },
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.stack).toBeUndefined();
    expect(body.error).toBeDefined();
  });
});
