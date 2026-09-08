import { Coordinate, Waypoint } from '@routewise/types';

export interface RoutingPoint {
  latitude: number;
  longitude: number;
}

export interface RawRouteStep {
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  mode: string;
  isToll?: boolean;
  geometry: [number, number][];
}

export interface RawRouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  steps: RawRouteStep[];
}

export interface RawRouteOption {
  distanceMeters: number;
  durationSeconds: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  legs: RawRouteLeg[];
}

export interface RoutingRequest {
  origin: Waypoint;
  destination: Waypoint;
  alternatives?: boolean | number;
  excludeTolls?: boolean;
  waypoints?: Coordinate[];
}

export interface RoutingResponse {
  provider: string;
  routes: RawRouteOption[];
  latencyMs: number;
}
