import { RoutingProvider, ProviderHealthCheck } from './routing-provider.interface';
import { RoutingRequest, RoutingResponse, RawRouteOption } from '../types';
import { queretaroCdmxFixture } from '../fixtures/queretaro-cdmx';
import { queretaroSanluisFixture } from '../fixtures/queretaro-sanluis';

export class MockRoutingProvider implements RoutingProvider {
  public readonly name = 'mock';

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    const startTime = Date.now();
    const destLat = request.destination.latitude;

    let fixture: any = queretaroCdmxFixture;
    if (Math.abs(destLat - 22.15) < 1.0) {
      fixture = queretaroSanluisFixture;
    }

    // Si se solicitan waypoints específicos (ej. bypass híbrido o ancla libre)
    if (request.waypoints && request.waypoints.length > 0) {
      const coords: [number, number][] = [
        [request.origin.longitude, request.origin.latitude],
        ...request.waypoints.map((wp) => [wp.longitude, wp.latitude] as [number, number]),
        [request.destination.longitude, request.destination.latitude],
      ];

      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 224000,
            durationSeconds: 10800,
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
            legs: [
              {
                distanceMeters: 224000,
                durationSeconds: 10800,
                steps: [
                  { name: 'Tramo Inicial', distanceMeters: 10000, durationSeconds: 600, mode: 'driving', isToll: false, geometry: [] },
                  { name: 'Autopista Cuota / Bypass', distanceMeters: 214000, durationSeconds: 10200, mode: 'driving', isToll: true, geometry: [] },
                ],
              },
            ],
          },
        ],
      };
    }

    const routes: RawRouteOption[] = [];

    if (fixture && fixture.fastRoute) {
      routes.push({
        distanceMeters: fixture.fastRoute.distanceMeters,
        durationSeconds: fixture.fastRoute.durationSeconds,
        geometry: {
          type: 'LineString',
          coordinates: fixture.fastRoute.geometry || [
            [request.origin.longitude, request.origin.latitude],
            [request.destination.longitude, request.destination.latitude],
          ],
        },
        legs: fixture.fastRoute.legs,
      });
    }

    if (fixture && fixture.cheapRoute && !request.excludeTolls) {
      routes.push({
        distanceMeters: fixture.cheapRoute.distanceMeters,
        durationSeconds: fixture.cheapRoute.durationSeconds,
        geometry: {
          type: 'LineString',
          coordinates: fixture.cheapRoute.geometry || [
            [request.origin.longitude, request.origin.latitude],
            [request.destination.longitude, request.destination.latitude],
          ],
        },
        legs: fixture.cheapRoute.legs,
      });
    }

    if (fixture && (fixture as any).hybridRoute && !request.excludeTolls) {
      const hybrid = (fixture as any).hybridRoute;
      routes.push({
        distanceMeters: hybrid.distanceMeters,
        durationSeconds: hybrid.durationSeconds,
        geometry: {
          type: 'LineString',
          coordinates: hybrid.geometry || [
            [request.origin.longitude, request.origin.latitude],
            [request.destination.longitude, request.destination.latitude],
          ],
        },
        legs: hybrid.legs,
      });
    }

    if (routes.length === 0) {
      const straightLineDist = Math.hypot(
        (request.destination.latitude - request.origin.latitude) * 111000,
        (request.destination.longitude - request.origin.longitude) * 102000
      );
      const estDuration = Math.round(straightLineDist / 25);

      routes.push({
        distanceMeters: Math.round(straightLineDist * 1.25),
        durationSeconds: estDuration,
        geometry: {
          type: 'LineString',
          coordinates: [
            [request.origin.longitude, request.origin.latitude],
            [request.destination.longitude, request.destination.latitude],
          ],
        },
        legs: [
          {
            distanceMeters: Math.round(straightLineDist * 1.25),
            durationSeconds: estDuration,
            steps: [
              {
                name: 'Ruta principal',
                distanceMeters: Math.round(straightLineDist * 1.25),
                durationSeconds: estDuration,
                mode: 'driving',
                isToll: false,
                geometry: [
                  [request.origin.longitude, request.origin.latitude],
                  [request.destination.longitude, request.destination.latitude],
                ],
              },
            ],
          },
        ],
      });
    }

    return {
      provider: this.name,
      routes,
      latencyMs: Date.now() - startTime,
    };
  }

  public async checkHealth(): Promise<ProviderHealthCheck> {
    return {
      status: 'ok',
      latencyMs: 1,
    };
  }
}
