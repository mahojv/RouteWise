import { Coordinate } from '@routewise/types';
import { RoutingProvider, ProviderHealthCheck } from './routing-provider.interface';
import { RoutingRequest, RoutingResponse, NearestResponse, RawRouteOption, RawRouteLeg, RawRouteStep } from '../types';

export interface OSRMProviderConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export class OSRMProvider implements RoutingProvider {
  public readonly name = 'osrm';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config?: OSRMProviderConfig) {
    this.baseUrl = (config?.baseUrl || 'http://localhost:5000').replace(/\/$/, '');
    this.timeoutMs = config?.timeoutMs || 5000;
  }

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    const startTime = Date.now();
    const coordinates: string[] = [
      `${request.origin.longitude},${request.origin.latitude}`,
    ];

    if (request.waypoints && request.waypoints.length > 0) {
      for (const wp of request.waypoints) {
        coordinates.push(`${wp.longitude},${wp.latitude}`);
      }
    }

    coordinates.push(`${request.destination.longitude},${request.destination.latitude}`);

    const coordsParam = coordinates.join(';');
    const alternatives = request.alternatives ? 'true' : 'false';
    const url = `${this.baseUrl}/route/v1/driving/${coordsParam}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`OSRM HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(`OSRM routing failed: ${data.code || 'No routes returned'}`);
      }

      const routes: RawRouteOption[] = data.routes.map((r: any) => {
        const legs: RawRouteLeg[] = (r.legs || []).map((leg: any) => {
          const steps: RawRouteStep[] = (leg.steps || []).map((step: any) => {
            const isToll = Boolean(
              step.ref?.includes('D') ||
              step.name?.toLowerCase().includes('cuota') ||
              step.name?.toLowerCase().includes('autopista') ||
              step.intersections?.some((i: any) => i.toll === true)
            );

            return {
              name: step.name || '',
              ref: step.ref,
              distanceMeters: Math.round(step.distance || 0),
              durationSeconds: Math.round(step.duration || 0),
              mode: step.mode || 'driving',
              isToll,
              geometry: step.geometry?.coordinates || [],
              intersections: (step.intersections || []).map((i: any) => ({
                location: i.location,
                bearings: i.bearings || [],
                entry: i.entry || [],
                in: i.in,
                out: i.out,
                toll: i.toll,
                classes: i.classes,
              })),
              maneuver: step.maneuver ? {
                type: step.maneuver.type,
                modifier: step.maneuver.modifier,
                location: step.maneuver.location,
                bearingBefore: step.maneuver.bearing_before,
                bearingAfter: step.maneuver.bearing_after,
              } : undefined,
            };
          });

          return {
            distanceMeters: Math.round(leg.distance || 0),
            durationSeconds: Math.round(leg.duration || 0),
            steps,
          };
        });

        return {
          distanceMeters: Math.round(r.distance || 0),
          durationSeconds: Math.round(r.duration || 0),
          geometry: r.geometry,
          legs,
        };
      });

      return {
        provider: this.name,
        routes,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`OSRM request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async findNearest(point: Coordinate): Promise<NearestResponse> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/nearest/v1/driving/${point.longitude},${point.latitude}?number=1`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`OSRM nearest HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      if (data.code !== 'Ok' || !data.waypoints) {
        throw new Error(`OSRM nearest failed: ${data.code || 'No snapped waypoints returned'}`);
      }

      const snappedPoints = data.waypoints.map((wp: any) => ({
        location: wp.location as [number, number],
        distanceMeters: Math.round(wp.distance || 0),
        name: wp.name || undefined,
      }));

      return {
        provider: this.name,
        snappedPoints,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`OSRM nearest timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async checkHealth(): Promise<ProviderHealthCheck> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const testUrl = `${this.baseUrl}/route/v1/driving/-100.389,20.588;-99.996,20.388?overview=false`;
      const response = await fetch(testUrl, { signal: controller.signal });
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          status: 'ok',
          latencyMs,
        };
      }

      return {
        status: 'error',
        latencyMs,
        message: `HTTP ${response.status}`,
      };
    } catch (err: any) {
      return {
        status: 'unreachable',
        latencyMs: Date.now() - startTime,
        message: err.message || 'Unreachable',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
