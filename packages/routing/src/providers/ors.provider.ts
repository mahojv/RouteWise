import { RoutingProvider, ProviderHealthCheck } from './routing-provider.interface';
import { RoutingRequest, RoutingResponse } from '../types';

export interface ORSProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class ORSProvider implements RoutingProvider {
  public readonly name = 'openrouteservice';
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config?: ORSProviderConfig) {
    this.baseUrl = (config?.baseUrl || 'http://localhost:8080').replace(/\/$/, '');
    this.apiKey = config?.apiKey;
    this.timeoutMs = config?.timeoutMs || 5000;
  }

  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    const startTime = Date.now();
    const coordinates: [number, number][] = [
      [request.origin.longitude, request.origin.latitude],
    ];

    if (request.waypoints && request.waypoints.length > 0) {
      for (const wp of request.waypoints) {
        coordinates.push([wp.longitude, wp.latitude]);
      }
    }

    coordinates.push([request.destination.longitude, request.destination.latitude]);

    const url = `${this.baseUrl}/ors/v2/directions/driving-car/geojson`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = this.apiKey;
    }

    const body: Record<string, any> = {
      coordinates,
      instructions: true,
      elevation: false,
    };

    if (request.excludeTolls) {
      body.options = { avoid_features: ['tollways'] };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ORS HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const features = data.features || [];

      const routes = features.map((feature: any) => {
        const summary = feature.properties?.summary || {};
        const segments = feature.properties?.segments || [];

        return {
          distanceMeters: Math.round(summary.distance || 0),
          durationSeconds: Math.round(summary.duration || 0),
          geometry: feature.geometry,
          legs: segments.map((seg: any) => ({
            distanceMeters: Math.round(seg.distance || 0),
            durationSeconds: Math.round(seg.duration || 0),
            steps: (seg.steps || []).map((step: any) => ({
              name: step.name || '',
              distanceMeters: Math.round(step.distance || 0),
              durationSeconds: Math.round(step.duration || 0),
              mode: 'driving',
              isToll: step.toll || false,
              geometry: [],
            })),
          })),
        };
      });

      return {
        provider: this.name,
        routes,
        latencyMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async checkHealth(): Promise<ProviderHealthCheck> {
    const startTime = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/ors/v2/health`);
      return {
        status: res.ok ? 'ok' : 'error',
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        status: 'unreachable',
        latencyMs: Date.now() - startTime,
        message: err.message,
      };
    }
  }
}
