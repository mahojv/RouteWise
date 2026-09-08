import { describe, it, expect } from 'vitest';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import { RoutingProvider, RoutingRequest, RoutingResponse } from '@routewise/routing';

class FalseBypassMockProvider implements RoutingProvider {
  public readonly name = 'false-bypass-mock';
  public behavior: 'IGNORES_WAYPOINTS' | 'CROSSES_TARGET_TOLL';

  constructor(behavior: 'IGNORES_WAYPOINTS' | 'CROSSES_TARGET_TOLL') {
    this.behavior = behavior;
  }

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    const isHybridCall = request.waypoints && request.waypoints.length === 2;

    if (isHybridCall) {
      if (this.behavior === 'IGNORES_WAYPOINTS') {
        // Devuelve una ruta que ignora por completo E_out y E_in (a más de 5000m de distancia)
        return {
          provider: this.name,
          latencyMs: 5,
          routes: [
            {
              distanceMeters: 200000,
              durationSeconds: 8000,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-100.3899, 20.5888],
                  [-100.1000, 20.1000], // Lejos de E_out [-99.9920, 20.3850] y E_in [-99.8850, 20.2520]
                  [-99.1332, 19.4326],
                ],
              },
              legs: [
                {
                  distanceMeters: 200000,
                  durationSeconds: 8000,
                  steps: [{ name: 'Ruta desviada', distanceMeters: 200000, durationSeconds: 8000, mode: 'driving', geometry: [] }],
                },
              ],
            },
          ],
        };
      }

      if (this.behavior === 'CROSSES_TARGET_TOLL') {
        // Devuelve una ruta que pasa por los waypoints pero luego vuelve a cruzar la caseta Palmillas [-99.9349, 20.3069]
        return {
          provider: this.name,
          latencyMs: 5,
          routes: [
            {
              distanceMeters: 215000,
              durationSeconds: 8500,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-100.3899, 20.5888],
                  [-99.9920, 20.3850], // E_out
                  [-99.9349, 20.3069], // Vuelve a cruzar Palmillas!
                  [-99.8850, 20.2520], // E_in
                  [-99.1332, 19.4326],
                ],
              },
              legs: [
                {
                  distanceMeters: 215000,
                  durationSeconds: 8500,
                  steps: [
                    { name: 'Carretera México - Querétaro (Cuota)', distanceMeters: 215000, durationSeconds: 8500, mode: 'driving', isToll: true, geometry: [] },
                  ],
                },
              ],
            },
          ],
        };
      }
    }

    // Fast Route base
    return {
      provider: this.name,
      latencyMs: 5,
      routes: [
        {
          distanceMeters: 218500,
          durationSeconds: 10100,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-100.3899, 20.5888],
              [-99.9349, 20.3069], // Palmillas
              [-99.1332, 19.4326],
            ],
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

describe('False Bypass Rejection Test', () => {
  it('Rejects candidate when OSRM ignores waypoints (> 200m)', async () => {
    const provider = new FalseBypassMockProvider('IGNORES_WAYPOINTS');
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

    const res = await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const hybridRoutes = res.routes.filter((r) => r.type === 'HYBRID');
    expect(hybridRoutes.length).toBe(0); // Ningún bypass falso aceptado
  });

  it('Rejects candidate when routed geometry crosses target toll plaza again', async () => {
    const provider = new FalseBypassMockProvider('CROSSES_TARGET_TOLL');
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

    const res = await service.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const hybridRoutes = res.routes.filter((r) => r.type === 'HYBRID');
    expect(hybridRoutes.length).toBe(0); // Rechazado por TollMatcher al detectar Palmillas
  });
});
