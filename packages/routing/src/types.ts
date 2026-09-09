import { Coordinate, Waypoint } from '@routewise/types';

export interface RoutingPoint {
  latitude: number;
  longitude: number;
}

export interface RawRouteIntersection {
  location: [number, number]; // [longitude, latitude]
  bearings: number[];
  entry: boolean[];
  in?: number;
  out?: number;
  lanes?: any[];
  classes?: string[];
  toll?: boolean;
}

export interface RawRouteStepManeuver {
  type: string;
  modifier?: string;
  location: [number, number]; // [longitude, latitude]
  bearingBefore: number;
  bearingAfter: number;
}

export interface RawRouteStep {
  name: string;
  ref?: string;
  distanceMeters: number;
  durationSeconds: number;
  mode: string;
  isToll?: boolean;
  geometry: [number, number][]; // [[lon, lat], ...]
  intersections?: RawRouteIntersection[];
  maneuver?: RawRouteStepManeuver;
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

/**
 * Score breakdown for explainability of candidate branches
 */
export interface BranchScoreBreakdown {
  forwardAlignmentScore: number;
  spatialDivergencePotential: number;
  routePositionScore: number;
  detourPenalty: number;
  baseScore: number;
  finalScore: number;
}

/**
 * Candidate Branch representation produced by CandidateBranchGenerator
 */
export interface BranchCandidate {
  id: string;
  originIntersection: Coordinate;
  branchBearing: number;
  baseRouteBearing: number;
  deflectionAngle: number;
  distanceFromOriginKm: number;
  seedPoint: Coordinate;
  seedDistanceMeters: number;
  sourceStepIndex: number;
  sourceIntersectionIndex: number;
  sourceStepName?: string;
  sourceStepRef?: string;
  fractionAlongRoute: number;
  score: number;
  scoreBreakdown: BranchScoreBreakdown;
  reasons: string[];
}

/**
 * Configuration options for candidate branch generation
 */
export interface CandidateGeneratorOptions {
  maxCandidates?: number;
  minDeflectionDegrees?: number;
  maxDetourRatio?: number;
  deduplicationDistanceMeters?: number;
  minSeedDistanceMeters?: number;
  maxSeedDistanceMeters?: number;
}

/**
 * Result of snapping a coordinate to the nearest road network node via /nearest
 */
export interface NearestPoint {
  location: [number, number]; // [longitude, latitude]
  distanceMeters: number;
  name?: string;
}

export interface NearestResponse {
  provider: string;
  snappedPoints: NearestPoint[];
  latencyMs: number;
}

/**
 * Spatial route divergence classification
 */
export type DivergenceClassification = 'REDUNDANT_CORRIDOR' | 'LOCAL_HYBRID' | 'REGIONAL_ALTERNATIVE';

/**
 * Metrics measuring how much a candidate route separates geometrically from the base route
 */
export interface RouteDivergenceMetrics {
  maxDivergenceMeters: number;
  meanDivergenceMeters: number;
  sustainedSeparationLengthMeters: number;
  divergenceRatio: number; // 0.00 to 1.00 (fraction of journey separated > separationThreshold)
  classification: DivergenceClassification;
}

/**
 * Multi-criteria Pareto trade-off status
 */
export type ParetoStatus = 'RECOMMENDED' | 'REASONABLE' | 'DOMINATED';

/**
 * Human-centric comparison and value metrics derived from route differences
 */
export interface UserValueComparison {
  distanceDeltaKm: number;
  timeDeltaMinutes: number;
  directSavingsEstimate?: number;
  tradeoffSummary: string;
  humanReasons: string[];
}

/**
 * Validated route candidate produced by CandidateEvaluator
 */
export interface RouteCandidate {
  id: string;
  branchCandidateId: string;
  branchCandidate: BranchCandidate;
  snappedWaypoint: Coordinate;
  snapDistanceMeters: number;
  isSnapAcceptable: boolean;
  rawRoute: RawRouteOption;
  divergence: RouteDivergenceMetrics;
  paretoStatus: ParetoStatus;
  userValue: UserValueComparison;
  isDuplicate: boolean;
}

/**
 * Configuration options for candidate evaluation
 */
export interface CandidateEvaluatorOptions {
  maxEvaluations?: number; // Maximum number of candidates to evaluate with /nearest + /route (default 2)
  maxSnapDistanceMeters?: number; // Maximum allowed snap distance from road network (default 750m)
  minSeparationThresholdMeters?: number; // Minimum distance to consider a point divergent (default 500m)
  regionalDivergenceThresholdMeters?: number; // Peak lateral distance for regional classification (default 5000m)
  regionalSustainedLengthMeters?: number; // Minimum sustained separation length for regional classification (default 20000m)
  duplicateDistanceToleranceMeters?: number; // Tolerance for detecting duplicate routes (default 2500m)
  duplicateDurationToleranceSeconds?: number; // Tolerance in duration for duplicate routes (default 180s)
}

/**
 * Overall result of the Phase 2 Candidate Evaluation pipeline
 */
export interface RouteCandidateEvaluationResult {
  baseRoute: RawRouteOption;
  evaluatedCandidates: RouteCandidate[];
  acceptedRouteCandidates: RouteCandidate[];
  osrmCallsUsed: number;
  maxOsrmBudget: number;
  reasons: string[];
}

