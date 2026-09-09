import { Coordinate, Waypoint } from '@routewise/types';
import {
  RawRouteOption,
  RawRouteStep,
  RawRouteIntersection,
  BranchCandidate,
  BranchScoreBreakdown,
  CandidateGeneratorOptions,
} from './types';

/**
 * Architectural Note / Special Limitation:
 * 
 * CandidateBranchGenerator operates strictly offline and deterministically on junction nodes
 * (intersections) observable along the provided OSRM base route.
 * 
 * SPECIAL CASE / LIMITATION:
 * This component CANNOT and DOES NOT guarantee discovering regional corridors that are totally
 * disjoint or never topologically reachable via observable branching intersections from the base route.
 * 
 * Full corridor validation and discovery is performed in downstream phases via topological expansion.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Standard Haversine great-circle distance between two coordinates in meters
 */
export function haversineDistanceMeters(c1: Coordinate, c2: Coordinate): number {
  const lat1 = (c1.latitude * Math.PI) / 180;
  const lon1 = (c1.longitude * Math.PI) / 180;
  const lat2 = (c2.latitude * Math.PI) / 180;
  const lon2 = (c2.longitude * Math.PI) / 180;

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Initial forward bearing from c1 to c2 in degrees [0, 360)
 */
export function calculateBearing(c1: Coordinate, c2: Coordinate): number {
  const lat1 = (c1.latitude * Math.PI) / 180;
  const lon1 = (c1.longitude * Math.PI) / 180;
  const lat2 = (c2.latitude * Math.PI) / 180;
  const lon2 = (c2.longitude * Math.PI) / 180;

  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Absolute acute angular deflection between two bearings in degrees [0, 180]
 */
export function calculateDeflection(bearingA: number, bearingB: number): number {
  const diff = Math.abs((bearingA - bearingB) % 360);
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Project a coordinate along a great-circle given an initial bearing and distance in meters
 */
export function projectCoordinate(
  origin: Coordinate,
  bearingDegrees: number,
  distanceMeters: number
): Coordinate {
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lon1 = (origin.longitude * Math.PI) / 180;
  const brng = (bearingDegrees * Math.PI) / 180;
  const dr = distanceMeters / EARTH_RADIUS_METERS;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) +
    Math.cos(lat1) * Math.sin(dr) * Math.cos(brng)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    );

  let finalLon = (lon2 * 180) / Math.PI;
  finalLon = ((((finalLon + 180) % 360) + 360) % 360) - 180;

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: finalLon,
  };
}

/**
 * Pure, deterministic generator that extracts candidate geometric branches from a BaseRoute
 */
export class CandidateBranchGenerator {
  private readonly defaultOptions: Required<CandidateGeneratorOptions> = {
    maxCandidates: 12,
    minDeflectionDegrees: 20,
    maxDetourRatio: 1.80,
    deduplicationDistanceMeters: 3000,
    minSeedDistanceMeters: 2000,
    maxSeedDistanceMeters: 35000,
  };

  /**
   * Generates candidate branches from a base route
   */
  public generateCandidates(
    baseRoute: RawRouteOption,
    origin: Waypoint | Coordinate,
    destination: Waypoint | Coordinate,
    options?: CandidateGeneratorOptions
  ): BranchCandidate[] {
    const opts: Required<CandidateGeneratorOptions> = {
      ...this.defaultOptions,
      ...options,
    };

    const originCoord: Coordinate = { latitude: origin.latitude, longitude: origin.longitude };
    const destCoord: Coordinate = { latitude: destination.latitude, longitude: destination.longitude };
    const directDistance = haversineDistanceMeters(originCoord, destCoord);
    const totalRouteDistance = baseRoute.distanceMeters || directDistance;

    if (!baseRoute.legs || baseRoute.legs.length === 0 || totalRouteDistance <= 0) {
      return [];
    }

    const unpenalizedPool: BranchCandidate[] = [];
    let accumulatedDistanceMeters = 0;

    for (let legIdx = 0; legIdx < baseRoute.legs.length; legIdx++) {
      const leg = baseRoute.legs[legIdx];
      const steps = leg.steps || [];

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];
        const stepIntersections = step.intersections || [];
        const stepStartDistance = accumulatedDistanceMeters;
        const stepStartCoord: Coordinate =
          step.geometry && step.geometry.length > 0
            ? { longitude: step.geometry[0][0], latitude: step.geometry[0][1] }
            : originCoord;

        for (let intIdx = 0; intIdx < stepIntersections.length; intIdx++) {
          const intersection = stepIntersections[intIdx];
          const intersectionCoord: Coordinate = {
            longitude: intersection.location[0],
            latitude: intersection.location[1],
          };

          // Position along route using intersection coordinates and accumulated step progress
          const distWithinStep = haversineDistanceMeters(stepStartCoord, intersectionCoord);
          const intersectionRouteDist =
            stepStartDistance + Math.min(step.distanceMeters || distWithinStep, distWithinStep);
          const fractionAlongRoute = Math.min(1, Math.max(0, intersectionRouteDist / totalRouteDistance));
          const remainingDistance = Math.max(1000, totalRouteDistance - intersectionRouteDist);

          // Determine the base route continuing bearing
          const baseRouteBearing = this.resolveBaseRouteBearing(intersection, step);

          // Inspect each exit branch from this intersection
          const bearings = intersection.bearings || [];
          const entries = intersection.entry || [];

          for (let bIdx = 0; bIdx < bearings.length; bIdx++) {
            // Rule 1: Must be legally transitable / entry allowed
            if (entries[bIdx] !== true) {
              continue;
            }

            // Rule 2: Must NOT be the continuing base route departure bearing
            if (intersection.out !== undefined && bIdx === intersection.out) {
              continue;
            }

            const branchBearing = bearings[bIdx];
            const deflectionAngle = calculateDeflection(branchBearing, baseRouteBearing);

            // Rule 3: Must have significant deflection from continuing path (avoid micro-turns/lane splits)
            if (deflectionAngle < opts.minDeflectionDegrees) {
              continue;
            }

            // Rule 4: Must not be a direct U-turn backward into the incoming segment
            if (intersection.in !== undefined && bIdx === intersection.in) {
              continue;
            }
            if (intersection.in !== undefined && bearings[intersection.in] !== undefined) {
              const inBearing = bearings[intersection.in];
              const reverseInBearing = (inBearing + 180) % 360;
              const uTurnDeflection = calculateDeflection(branchBearing, reverseInBearing);
              if (uTurnDeflection < 15) {
                continue;
              }
            }

            // Calculate adaptive seed distance proportional to route scale and remaining distance
            const seedDistanceMeters = this.calculateAdaptiveSeedDistance(
              totalRouteDistance,
              remainingDistance,
              opts.minSeedDistanceMeters,
              opts.maxSeedDistanceMeters
            );

            // Generate geometric seed coordinate
            const seedPoint = projectCoordinate(intersectionCoord, branchBearing, seedDistanceMeters);

            // Evaluate geometric detour ratio
            const distOriginToSeed = haversineDistanceMeters(originCoord, seedPoint);
            const distSeedToDest = haversineDistanceMeters(seedPoint, destCoord);
            const detourRatio = directDistance > 0 ? (distOriginToSeed + distSeedToDest) / directDistance : 1.0;

            // Pre-filtering: discard candidates with extreme geometrical detour
            if (detourRatio > opts.maxDetourRatio) {
              continue;
            }

            // Score and explain the candidate branch
            const { score, breakdown, reasons } = this.scoreCandidate(
              intersectionCoord,
              branchBearing,
              baseRouteBearing,
              deflectionAngle,
              fractionAlongRoute,
              destCoord,
              detourRatio,
              step,
              intersectionRouteDist
            );

            const candidate: BranchCandidate = {
              id: `branch_s${stepIdx}_i${intIdx}_b${bIdx}_${Math.round(branchBearing)}`,
              originIntersection: intersectionCoord,
              branchBearing,
              baseRouteBearing,
              deflectionAngle: Math.round(deflectionAngle * 10) / 10,
              distanceFromOriginKm: Math.round((intersectionRouteDist / 1000) * 10) / 10,
              seedPoint,
              seedDistanceMeters: Math.round(seedDistanceMeters),
              sourceStepIndex: stepIdx,
              sourceIntersectionIndex: intIdx,
              sourceStepName: step.name || undefined,
              sourceStepRef: step.ref || undefined,
              fractionAlongRoute: Math.round(fractionAlongRoute * 1000) / 1000,
              score,
              scoreBreakdown: breakdown,
              reasons,
            };

            unpenalizedPool.push(candidate);
          }
        }

        accumulatedDistanceMeters += step.distanceMeters || 0;
      }
    }

    // Deduplicate and rank candidates
    return this.deduplicateAndRank(unpenalizedPool, opts.deduplicationDistanceMeters, opts.maxCandidates);
  }

  /**
   * Determine base route continuing bearing at this intersection
   */
  private resolveBaseRouteBearing(intersection: RawRouteIntersection, step: RawRouteStep): number {
    if (
      intersection.out !== undefined &&
      intersection.bearings &&
      intersection.bearings[intersection.out] !== undefined
    ) {
      return intersection.bearings[intersection.out];
    }

    if (step.maneuver?.bearingAfter !== undefined) {
      return step.maneuver.bearingAfter;
    }

    if (step.geometry && step.geometry.length >= 2) {
      const p1: Coordinate = { longitude: step.geometry[0][0], latitude: step.geometry[0][1] };
      const p2: Coordinate = { longitude: step.geometry[1][0], latitude: step.geometry[1][1] };
      return calculateBearing(p1, p2);
    }

    return 0;
  }

  /**
   * Calculate adaptive seed distance based on route scale and position
   */
  private calculateAdaptiveSeedDistance(
    totalRouteDistance: number,
    remainingDistance: number,
    minDist: number,
    maxDist: number
  ): number {
    // Proportional heuristic: ~4% of total route distance or 25% of remaining distance
    const proportionalDistance = Math.min(totalRouteDistance * 0.04, remainingDistance * 0.25);
    return Math.max(minDist, Math.min(maxDist, proportionalDistance));
  }

  /**
   * Transparent scoring algorithm with explicit factor breakdowns
   */
  private scoreCandidate(
    intersectionCoord: Coordinate,
    branchBearing: number,
    baseRouteBearing: number,
    deflectionAngle: number,
    fractionAlongRoute: number,
    destinationCoord: Coordinate,
    detourRatio: number,
    step: RawRouteStep,
    intersectionRouteDistMeters: number
  ): { score: number; breakdown: BranchScoreBreakdown; reasons: string[] } {
    const reasons: string[] = [];

    // 1. Forward Alignment Score (0 - 100)
    // Continuous cosine formula ensuring that branches pointing somewhat sideways or detouring around terrain
    // are NOT immediately discarded, but rather gently scored.
    const bearingToDest = calculateBearing(intersectionCoord, destinationCoord);
    const destAngleDiff = calculateDeflection(branchBearing, bearingToDest);
    
    // Half-angle cosine squared: 0 deg diff -> 100, 90 deg diff -> 50, 180 deg diff -> 0
    const radDiff = (destAngleDiff * Math.PI) / 360;
    const forwardAlignmentScore = Math.round(Math.pow(Math.cos(radDiff), 2) * 100);

    reasons.push(
      `Bearing ${Math.round(branchBearing)}° vs destination bearing ${Math.round(bearingToDest)}° (alignment ${forwardAlignmentScore}/100)`
    );

    // 2. Spatial Divergence Potential (0 - 100)
    // Sweet spot deflection is 30° - 110° to discover meaningful parallel/regional corridors.
    let spatialDivergencePotential = 0;
    if (deflectionAngle >= 20 && deflectionAngle <= 120) {
      spatialDivergencePotential = Math.round(Math.sin(((deflectionAngle - 20) / 100) * (Math.PI / 2)) * 100);
    } else if (deflectionAngle > 120) {
      spatialDivergencePotential = Math.max(20, Math.round(100 - (deflectionAngle - 120) * 1.2));
    }
    reasons.push(
      `Lateral deflection ${Math.round(deflectionAngle)}° from base path (divergence potential ${spatialDivergencePotential}/100)`
    );

    // 3. Route Position Score (0 - 100)
    // Favors diversions across early, mid, and late stages equally with slight boost to early-mid bifurcations
    let routePositionScore = 70;
    if (fractionAlongRoute <= 0.15) {
      routePositionScore = 85;
      reasons.push(`Early route bifurcation at ${Math.round(fractionAlongRoute * 100)}% of journey`);
    } else if (fractionAlongRoute >= 0.85) {
      routePositionScore = 80;
      reasons.push(`Late route bifurcation at ${Math.round(fractionAlongRoute * 100)}% of journey`);
    } else if (fractionAlongRoute >= 0.30 && fractionAlongRoute <= 0.70) {
      routePositionScore = 90;
      reasons.push(`Mid-route bifurcation at ${Math.round(fractionAlongRoute * 100)}% of journey`);
    } else {
      reasons.push(`Intermediate bifurcation at ${Math.round(fractionAlongRoute * 100)}% of journey`);
    }

    // 4. Detour Penalty
    let detourPenalty = 0;
    if (detourRatio > 1.20) {
      detourPenalty = Math.round((detourRatio - 1.20) * 60);
      reasons.push(`Geometric detour ratio ${detourRatio.toFixed(2)} applied penalty -${detourPenalty}`);
    }

    // Combined score calculation (deterministic weights)
    const baseScore = Math.round(
      forwardAlignmentScore * 0.35 +
      spatialDivergencePotential * 0.35 +
      routePositionScore * 0.30
    );

    const finalScore = Math.max(1, Math.round(baseScore - detourPenalty));

    const breakdown: BranchScoreBreakdown = {
      forwardAlignmentScore,
      spatialDivergencePotential,
      routePositionScore,
      detourPenalty,
      baseScore,
      finalScore,
    };

    return { score: finalScore, breakdown, reasons };
  }

  /**
   * Deduplicates geometrically clustered seed points and returns the top candidates
   */
  private deduplicateAndRank(
    candidates: BranchCandidate[],
    dedupDistanceMeters: number,
    maxCandidates: number
  ): BranchCandidate[] {
    // Sort deterministically: highest score first, break ties with higher fractionAlongRoute, then lowest bearing
    const sorted = [...candidates].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.fractionAlongRoute !== a.fractionAlongRoute) {
        return b.fractionAlongRoute - a.fractionAlongRoute;
      }
      return a.branchBearing - b.branchBearing;
    });

    const selected: BranchCandidate[] = [];

    for (const candidate of sorted) {
      const isDuplicate = selected.some(
        (existing) =>
          haversineDistanceMeters(candidate.seedPoint, existing.seedPoint) < dedupDistanceMeters
      );

      if (!isDuplicate) {
        selected.push(candidate);
      }

      if (selected.length >= maxCandidates) {
        break;
      }
    }

    return selected;
  }
}
