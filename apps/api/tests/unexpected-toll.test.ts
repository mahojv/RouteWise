import { describe, it, expect } from 'vitest';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import { RoutingProvider, RoutingRequest, RoutingResponse } from '@routewise/routing';
import { TollMatcherService } from '../src/modules/tolls/toll-matcher.service';

class UnexpectedTollMockProvider implements RoutingProvider {
  public readonly name = 'unexpected-toll-mock';

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    const isHybridCall = request.waypoints && request.waypoints.length === 2 && request.waypoints[1].latitude === 20.2450;

    if (isHybridCall) {
      // Evade Palmillas pero cruza Caseta Querétaro - Celaya [-100.4851, 20.5512] ($95 MXN)
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 220000,
            durationSeconds: 9500,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.3899, 20.5888],
                [-99.6521, 20.3742], // E_out de Palmillas
                [-100.4851, 20.5512], // Caseta Celaya ($95)
                [-99.5850, 20.2450], // E_in de Palmillas
                [-99.1332, 19.4326],
              ],
            },
            legs: [
              {
                distanceMeters: 220000,
                durationSeconds: 9500,
                steps: [
                  { name: 'Tramo Libre Alternativo', distanceMeters: 50000, durationSeconds: 2500, mode: 'driving', geometry: [] },
                  { name: 'Carretera Querétaro - Celaya (Cuota)', distanceMeters: 170000, durationSeconds: 7000, mode: 'driving', isToll: true, geometry: [] },
                ],
              },
            ],
          },
        ],
      };
    }

    // Fast Base (Palmillas $108 + Tepotzotlán $108 = $216)
    return {
      provider: this.name,
      latencyMs: 5,
      routes: [
        {
          distanceMeters: 218500,
          durationSeconds: 9000,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-100.3899, 20.5888],
              [-99.9349, 20.3069], // Palmillas ($108)
              [-99.2075, 19.7144], // Tepotzotlán ($108)
              [-99.1332, 19.4326],
            ],
          },
          legs: [
            {
              distanceMeters: 218500,
              durationSeconds: 9000,
              steps: [
                { name: 'Carretera México - Querétaro (Cuota)', distanceMeters: 218500, durationSeconds: 9000, mode: 'driving', isToll: true, geometry: [] },
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

import { TollBypassResolverService } from '../src/modules/tolls/toll-bypass-resolver.service';
import { FIXTURE_CURATED_BYPASSES } from '../src/fixtures/bypasses.fixture';

describe('Unexpected Toll Retention & Cost Recalculation Test', () => {
  it('Retains unexpected tolls found along hybrid bypass and recalculates total cost', async () => {
    const provider = new UnexpectedTollMockProvider();
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new TollBypassResolverService(FIXTURE_CURATED_BYPASSES),
      undefined,
      undefined,
      provider
    );

    const res = await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const hybridRoute = res.routes.find((r) => r.type === 'HYBRID');
    expect(hybridRoute).toBeDefined();

    // 1. Verifica que NO contiene Palmillas
    const hasPalmillas = hybridRoute!.tolls.some((t) => t.name.includes('Palmillas'));
    expect(hasPalmillas).toBe(false);

    // 2. Verifica que contiene la caseta inesperada Celaya ($95)
    const hasCelaya = hybridRoute!.tolls.some((t) => t.name.includes('Celaya'));
    expect(hasCelaya).toBe(true);

    // 3. El costo de casetas refleja exactamente la caseta detectada ($95)
    expect(hybridRoute!.tollCost).toBe(95);
    expect(hybridRoute!.cost.tolls).toBe(95);
    expect(hybridRoute!.cost.direct).toBe(Math.round((hybridRoute!.fuelCost + 95) * 100) / 100);
  });
});
