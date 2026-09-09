import { describe, it, expect } from 'vitest';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import {
  RoutingProvider,
  RoutingRequest,
  RoutingResponse,
  NearestResponse,
  RawRouteOption,
} from '@routewise/routing';

class DiscoveryMockProvider implements RoutingProvider {
  public readonly name = 'discovery-mock-provider';
  public callCount = 0;
  public nearestCallCount = 0;
  public routeCallCount = 0;

  // Base route: with an observable lateral branch at an intersection
  private baseRoute: RawRouteOption = {
    distanceMeters: 200000,
    durationSeconds: 7200,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-100.0, 20.0],
        [-99.0, 20.0],
        [-98.0, 20.0],
      ],
    },
    legs: [
      {
        distanceMeters: 200000,
        durationSeconds: 7200,
        steps: [
          {
            name: 'Autopista Principal (Cuota)',
            distanceMeters: 200000,
            durationSeconds: 7200,
            mode: 'driving',
            isToll: true,
            geometry: [
              [-100.0, 20.0],
              [-98.0, 20.0],
            ],
            intersections: [
              {
                location: [-99.0, 20.0],
                bearings: [90, 150], // 90 is base route (East), 150 is branch (South-East)
                entry: [true, true],
                out: 0,
              },
            ],
          },
        ],
      },
    ],
  };

  // Discovered regional alternative route (faster alternative corridor)
  private discoveredRoute: RawRouteOption = {
    distanceMeters: 210000,
    durationSeconds: 6900,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-100.0, 20.0],
        [-99.0, 20.3], // Regional corridor separation
        [-98.0, 20.0],
      ],
    },
    legs: [
      {
        distanceMeters: 210000,
        durationSeconds: 6900,
        steps: [
          {
            name: 'Corredor Regional Libre',
            distanceMeters: 210000,
            durationSeconds: 6900,
            mode: 'driving',
            isToll: false,
            geometry: [
              [-100.0, 20.0],
              [-99.0, 20.3],
              [-98.0, 20.0],
            ],
          },
        ],
      },
    ],
  };

  public async findNearest(point: { latitude: number; longitude: number }): Promise<NearestResponse> {
    this.callCount++;
    this.nearestCallCount++;
    return {
      provider: this.name,
      snappedPoints: [
        {
          location: [point.longitude, point.latitude],
          distanceMeters: 25,
          name: 'Carretera Enlace',
        },
      ],
      latencyMs: 1,
    };
  }

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    this.callCount++;
    this.routeCallCount++;

    if (request.waypoints && request.waypoints.length > 0) {
      return {
        provider: this.name,
        routes: [this.discoveredRoute],
        latencyMs: 5,
      };
    }

    return {
      provider: this.name,
      routes: [this.baseRoute],
      latencyMs: 5,
    };
  }

  public async checkHealth() {
    return { status: 'ok' as const, latencyMs: 1 };
  }
}

describe('RouteDiscovery API Integration (Phase 2.5)', () => {
  it('integra CandidateBranchGenerator y CandidateEvaluator al flujo real de búsqueda respetando el presupuesto OSRM <= 5', async () => {
    const mockProvider = new DiscoveryMockProvider();
    const optimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { getAnchors: async () => null, getAnchor: async () => null } as any,
      mockProvider
    );

    const response = await optimizer.optimizeRoute({
      origin: { latitude: 20.0, longitude: -100.0, label: 'Origen' },
      destination: { latitude: 20.0, longitude: -98.0, label: 'Destino' },
      preferences: { mode: 'BALANCED' },
    });

    // 1. Verificación del presupuesto OSRM
    expect(mockProvider.callCount).toBeLessThanOrEqual(5);

    // 2. Verificación de rutas generadas
    expect(response.routes.length).toBeGreaterThanOrEqual(1);

    // 3. Verificación de que la ruta descubierta está presente
    const discoveryRoute = response.routes.find((r) => r.id.startsWith('route-discovery'));
    expect(discoveryRoute).toBeDefined();
    if (discoveryRoute) {
      expect(discoveryRoute.title).toContain('Regional');
      expect(discoveryRoute.distanceMeters).toBe(210000);
      expect(discoveryRoute.durationSeconds).toBe(6900);
    }
  });

  it('mantiene resiliencia si /nearest o /route de discovery fallan', async () => {
    const failingProvider: RoutingProvider = {
      name: 'failing-discovery-mock',
      findNearest: async () => {
        throw new Error('OSRM Nearest Offline');
      },
      calculateRoute: async () => ({
        provider: 'failing-discovery-mock',
        routes: [
          {
            distanceMeters: 200000,
            durationSeconds: 7200,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.0, 20.0],
                [-98.0, 20.0],
              ],
            },
            legs: [],
          },
        ],
        latencyMs: 5,
      }),
      checkHealth: async () => ({ status: 'ok', latencyMs: 1 }),
    };

    const optimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      failingProvider
    );

    const response = await optimizer.optimizeRoute({
      origin: { latitude: 20.0, longitude: -100.0, label: 'Origen' },
      destination: { latitude: 20.0, longitude: -98.0, label: 'Destino' },
    });

    // La búsqueda no falló y devolvió la ruta base disponible
    expect(response.routes.length).toBeGreaterThanOrEqual(1);
  });
});
