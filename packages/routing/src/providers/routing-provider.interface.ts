import { Coordinate } from '@routewise/types';
import { RoutingRequest, RoutingResponse, NearestResponse } from '../types';

export interface ProviderHealthCheck {
  status: 'ok' | 'error' | 'unreachable';
  latencyMs: number;
  message?: string;
}

export interface RoutingProvider {
  readonly name: string;
  calculateRoute(request: RoutingRequest): Promise<RoutingResponse>;
  findNearest?(point: Coordinate): Promise<NearestResponse>;
  checkHealth(): Promise<ProviderHealthCheck>;
}

