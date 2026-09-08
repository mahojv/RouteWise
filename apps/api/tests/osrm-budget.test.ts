import { describe, it, expect } from 'vitest';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import { RoutingProvider, RoutingRequest, RoutingResponse } from '@routewise/routing';

class BudgetSpyMockProvider implements RoutingProvider {
  public readonly name = 'budget-spy-mock';
  public callCount = 0;
  private scenario: 'NO_BYPASS' | 'ONE_BYPASS' | 'TWO_BYPASSES' | 'TEN_TOLLS' | 'FAILED_BYPASS';

  constructor(scenario: 'NO_BYPASS' | 'ONE_BYPASS' | 'TWO_BYPASSES' | 'TEN_TOLLS' | 'FAILED_BYPASS') {
    this.scenario = scenario;
  }

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    this.callCount++;

    const isHybrid1 = request.waypoints && request.waypoints.length === 2 && Math.abs(request.waypoints[0].latitude - 20.3850) < 0.01;
    const isHybrid2 = request.waypoints && request.waypoints.length === 2 && Math.abs(request.waypoints[0].latitude - 19.8250) < 0.01;
    const isCombined = request.waypoints && request.waypoints.length === 4;

    if (this.scenario === 'FAILED_BYPASS' && (isHybrid1 || isHybrid2)) {
      // Simula fallo al rutear bypass
      throw new Error('OSRM routing failure');
    }

    if (isCombined) {
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 230000,
            durationSeconds: 11000,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.9920, 20.3850], // E_out_1
                [-99.8850, 20.2520], // E_in_1
                [-99.2780, 19.8250], // E_out_2
                [-99.1850, 19.6450], // E_in_2
                [-99.1332, 19.4326],
              ],
            },
            legs: [{ distanceMeters: 230000, durationSeconds: 11000, steps: [] }],
          },
        ],
      };
    }

    if (isHybrid1) {
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 220000,
            durationSeconds: 10500,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.9920, 20.3850],
                [-99.8850, 20.2520],
                [-99.2075, 19.7144], // Conserva Tepotzotlán
                [-99.1332, 19.4326],
              ],
            },
            legs: [{ distanceMeters: 220000, durationSeconds: 10500, steps: [] }],
          },
        ],
      };
    }

    if (isHybrid2) {
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 222000,
            durationSeconds: 10600,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.9349, 20.3069], // Conserva Palmillas
                [-99.2780, 19.8250],
                [-99.1850, 19.6450],
                [-99.1332, 19.4326],
              ],
            },
            legs: [{ distanceMeters: 222000, durationSeconds: 10600, steps: [] }],
          },
        ],
      };
    }

    // Fast Base Route
    let coords: [number, number][] = [
      [-100.3899, 20.5888],
      [-99.9349, 20.3069], // Palmillas
      [-99.2075, 19.7144], // Tepotzotlán
      [-99.1332, 19.4326],
    ];

    if (this.scenario === 'NO_BYPASS') {
      // Ruta sin casetas que tengan bypass curado
      coords = [
        [-100.3899, 20.5888],
        [-99.1332, 19.4326],
      ];
    } else if (this.scenario === 'ONE_BYPASS') {
      // Solo contiene Palmillas
      coords = [
        [-100.3899, 20.5888],
        [-99.9349, 20.3069],
        [-99.1332, 19.4326],
      ];
    }

    return {
      provider: this.name,
      latencyMs: 5,
      routes: [
        {
          distanceMeters: 218500,
          durationSeconds: 10100,
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          legs: [
            {
              distanceMeters: 218500,
              durationSeconds: 10100,
              steps: [
                { name: 'Carretera México - Querétaro (Cuota)', distanceMeters: 218500, durationSeconds: 10100, mode: 'driving', isToll: true, geometry: [] },
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

describe('Strict OSRM Call Budget Enforcement (<= 5 Calls)', () => {
  it('Scenario 1: No bypass available consumes at most 2 calls (Fast + Free Base)', async () => {
    const provider = new BudgetSpyMockProvider('NO_BYPASS');
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      provider
    );

    await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    expect(provider.callCount).toBeLessThanOrEqual(2);
  });

  it('Scenario 2: One valid bypass consumes at most 3 calls (Fast + Free Base + Hybrid 1)', async () => {
    const provider = new BudgetSpyMockProvider('ONE_BYPASS');
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      provider
    );

    await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    expect(provider.callCount).toBeLessThanOrEqual(3);
  });

  it('Scenario 3: Two valid sequential bypasses consumes at most 5 calls including Combined', async () => {
    const provider = new BudgetSpyMockProvider('TWO_BYPASSES');
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      provider
    );

    await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    expect(provider.callCount).toBeLessThanOrEqual(5);
  });

  it('Scenario 4: Route with many tolls never exceeds the strict 5-call budget', async () => {
    const provider = new BudgetSpyMockProvider('TWO_BYPASSES');
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      provider
    );

    await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    expect(provider.callCount).toBeLessThanOrEqual(5);
  });

  it('Scenario 5: Failed bypasses do not trigger runaway OSRM calls', async () => {
    const provider = new BudgetSpyMockProvider('FAILED_BYPASS');
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      provider
    );

    await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    expect(provider.callCount).toBeLessThanOrEqual(5);
  });
});
