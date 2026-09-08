import { RoutingRequest, RoutingResponse } from '../types';

export interface ProviderHealthCheck {
  status: 'ok' | 'error' | 'unreachable';
  latencyMs: number;
  message?: string;
}

export interface RoutingProvider {
  readonly name: string;
  calculateRoute(request: RoutingRequest): Promise<RoutingResponse>;
  checkHealth(): Promise<ProviderHealthCheck>;
}
