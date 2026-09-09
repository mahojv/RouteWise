/**
 * Geographic coordinates representation
 */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Labeled waypoint
 */
export interface Waypoint extends Coordinate {
  label?: string;
}

/**
 * Fuel type taxonomy
 */
export type FuelType = 'gasolina_regular' | 'gasolina_premium' | 'diesel' | 'electrico' | 'hibrido';

/**
 * Vehicle category for toll calculation & consumption
 */
export type VehicleType = 'automovil' | 'motocicleta' | 'camion_2_ejes' | 'camion_3_ejes' | 'camion_4_plus' | 'autobus';

/**
 * Standardized vehicle category for toll rates
 */
export type TollVehicleType = 'CAR' | 'MOTORCYCLE' | 'BUS' | 'TRUCK';

/**
 * Payment method for toll plazas
 */
export type TollPaymentMethod = 'CASH' | 'ELECTRONIC' | 'ANY';

/**
 * Status of toll price recency and availability
 */
export type TollPriceStatus = 'VALID' | 'OUTDATED' | 'UNKNOWN';

/**
 * User / Vehicle specification
 */
export interface Vehicle {
  id: string;
  userId?: string;
  name: string;
  fuelType: FuelType;
  fuelConsumption: number;
  fuelPrice: number;
  vehicleType: VehicleType;
  createdAt: string;
  updatedAt: string;
}

/**
 * Official & Community Toll Data Sources
 */
export type TollSourceType = 'OFFICIAL_OPEN_DATA' | 'CONCESSIONAIRE' | 'OSM' | 'MANUAL' | 'USER_REPORTED';

export interface DataSource {
  id: string;
  name: string;
  provider: string; // CAPUFE, FONADIN, etc.
  url?: string;
  sourceType: TollSourceType;
  license?: string;
  lastImportAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Historical and active toll rates per plaza and vehicle type
 */
export interface TollRate {
  id: string;
  tollPlazaId: string;
  vehicleType: TollVehicleType;
  paymentMethod: TollPaymentMethod;
  price: number;
  currency: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  sourceId?: string;
  sourceReference?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Toll plaza representation
 */
export interface TollPlaza {
  id: string;
  name: string;
  operator: string;
  highway?: string;
  road?: string;
  latitude: number;
  longitude: number;
  direction?: 'both' | 'north' | 'south' | 'east' | 'west';
  kmMarker?: number;
  vehicleType: VehicleType;
  cashPrice: number;
  electronicPrice?: number;
  currency: string;
  source: string;
  sourceId?: string;
  sourceReference?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Point-in-route toll event with parametric location and price metadata
 */
export interface TollEvent {
  id: string;
  tollPlazaId: string;
  name: string;
  operator: string;
  highway?: string;
  road?: string;
  latitude: number;
  longitude: number;
  price: number;
  priceStatus: TollPriceStatus;
  effectiveDate?: string;
  routePosition: number; // 0.00 (start of route) to 1.00 (end of route)
  paymentMethod?: TollPaymentMethod;
  isAvoided?: boolean;
  distanceToRouteMeters?: number;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  matchStatus?: 'MATCHED' | 'FALLBACK_MATCHED' | 'UNMATCHED';
}

/**
 * Toll bypass candidate representation for hybrid routing
 */
export interface TollBypassCandidate {
  tollPlazaId: string;
  exitPoint: Coordinate;
  reentryPoint: Coordinate;
  exitDistanceMeters: number;
  reentryDistanceMeters: number;
  confidence: number;
  source: 'CURATED' | 'ROUTE_DIVERGENCE';
  isVerified: boolean;
  name?: string;
}

/**
 * Segment classification
 */
export type RouteSegmentType = 'FREE' | 'TOLL';

/**
 * Individual leg / segment in a composite route
 */
export interface RouteSegment {
  id: string;
  sequence: number;
  type: RouteSegmentType;
  name?: string;
  distanceMeters: number;
  durationSeconds: number;
  tollCost: number;
  tollPlazaIds?: string[];
  geometry: string;
}

/**
 * Route classification modes
 */
export type RouteType = 'FAST' | 'CHEAP' | 'BALANCED' | 'NO_TOLL' | 'HYBRID';

/**
 * Route optimization preferences
 */
export type RoutePreferenceMode = 'MONEY' | 'BALANCED' | 'TIME';

export interface RoutePreference {
  mode: RoutePreferenceMode;
  timeValue: number;
  weightCost?: number;
  weightTime?: number;
}

/**
 * Structured cost breakdown distinguishing direct monetary cost from commuter time valuation
 */
export interface CostBreakdown {
  fuel: number;
  tolls: number;
  direct: number; // fuel + tolls
  time: number; // durationHours * timeValue
  generalized: number; // direct + time
  hasUnknownTolls?: boolean;
  hasOutdatedTolls?: boolean;
}

/**
 * Relative route comparison vs alternatives
 */
export interface RouteComparison {
  vsFastest?: {
    moneySaved: number;
    minutesAdded: number;
  };
  vsCheapest?: {
    extraMoney: number;
    minutesSaved: number;
    costPerMinuteSaved?: number;
  };
}

/**
 * Explainable comparison recommendation
 */
export interface RouteExplanation {
  headline: string;
  description: string;
  badge: string;
  isRecommended: boolean;
}

/**
 * Generated route option returned to client
 */
export interface RouteOption {
  id: string;
  type: RouteType;
  title: string;
  distanceMeters: number;
  durationSeconds: number;
  cost: CostBreakdown;
  tollCost: number; // Backwards-compatible shortcut
  fuelCost: number; // Backwards-compatible shortcut
  totalCost: number; // Backwards-compatible direct cost shortcut
  score: number;
  geometry: string;
  tolls: TollEvent[];
  tollPlazas: Array<{
    id: string;
    name: string;
    highway?: string;
    road?: string;
    price: number;
    latitude: number;
    longitude: number;
    distanceToRouteMeters?: number;
    confidence?: string;
    matchStatus?: string;
  }>;
  segments: RouteSegment[];
  costBreakdown: CostBreakdown; // Backwards-compatible alias
  comparison?: RouteComparison;
  explanation: RouteExplanation;
}

/**
 * GeoJSON LineString representation for public route geometry
 */
export interface GeoJSONGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lon, lat]
}

/**
 * Clean public toll plaza item without internal OSRM/DB leak
 */
export interface PublicTollPlaza {
  id: string;
  name: string;
  price: number;
  latitude: number;
  longitude: number;
}

/**
 * Public route option representation for Mobile client
 */
export interface PublicRouteOption {
  id: string;
  type: RouteType;
  title: string;
  distanceKm: number;
  durationMinutes: number;
  cost: CostBreakdown;
  geometry: GeoJSONGeometry;
  tolls: PublicTollPlaza[];
  comparison?: RouteComparison;
  explanation: RouteExplanation;
}

/**
 * Canonical route search request payload for public API
 */
export interface RouteSearchRequest {
  origin: Waypoint;
  destination: Waypoint;
  vehicle?: {
    type?: VehicleType;
    fuelType?: FuelType;
    fuelEfficiencyKmPerLiter?: number;
    fuelPricePerLiter?: number;
  };
  preferences?: {
    strategy?: RoutePreferenceMode;
    timeValue?: number;
  };
}

/**
 * Canonical route search response payload for public Mobile API
 */
export interface RouteSearchResponse {
  searchId: string;
  origin: Waypoint;
  destination: Waypoint;
  recommendedRouteId: string;
  routes: PublicRouteOption[];
  calculatedAt: string;
}

/**
 * Route calculation request payload
 */
export interface RouteCalculationRequest {
  origin: Waypoint;
  destination: Waypoint;
  vehicle?: Partial<Pick<Vehicle, 'fuelConsumption' | 'fuelPrice' | 'vehicleType'>>;
  preferences?: {
    mode?: RoutePreferenceMode;
    timeValue?: number;
  };
  avoidTollPlazaIds?: string[];
}

/**
 * Route calculation response payload
 */
export interface RouteCalculationResponse {
  searchId: string;
  origin: Waypoint;
  destination: Waypoint;
  recommendedRouteId: string;
  routes: RouteOption[];
  calculatedAt: string;
}

/**
 * Recalculate route with avoided / enforced toll plazas
 */
export interface RecalculateRouteRequest {
  avoidTollPlazaIds: string[];
}

/**
 * Geocoding query result
 */
export interface GeocodingResult {
  id: string;
  displayName: string;
  latitude: number;
  longitude: number;
  type: string;
  importance: number;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

/**
 * Health check response
 */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
  services: {
    database: {
      status: 'connected' | 'disconnected' | 'disabled';
      postgisEnabled: boolean;
      latencyMs?: number;
    };
    routing: {
      provider: string;
      status: 'ok' | 'error' | 'unreachable';
      latencyMs?: number;
    };
    geocoding: {
      provider: string;
      status: 'ok' | 'error';
    };
  };
}
