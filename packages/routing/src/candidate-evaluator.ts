import { Coordinate, Waypoint } from '@routewise/types';
import {
  RawRouteOption,
  BranchCandidate,
  RouteCandidate,
  RouteDivergenceMetrics,
  UserValueComparison,
  ParetoStatus,
  CandidateEvaluatorOptions,
  RouteCandidateEvaluationResult,
  DivergenceClassification,
} from './types';
import { RoutingProvider } from './providers/routing-provider.interface';
import { haversineDistanceMeters, calculateBearing } from './candidate-branch-generator';

/**
 * Architectural Note / Phase 2 Scope:
 *
 * CandidateEvaluator bridges geometric BranchCandidates from Phase 1 with the real OSRM road graph.
 * 
 * Pipeline:
 * BranchCandidate[] 
 *   -> Cheap Diversity Selection (max 2 candidates per search budget)
 *   -> OSRM /nearest validation (snap distance check)
 *   -> OSRM /route exploration (O -> W -> D)
 *   -> Geometric Divergence Analysis (separates redundant variants from regional alternatives)
 *   -> Multi-objective Pareto & Human-Centric UX Value Derivation
 * 
 * SPECIAL LIMITATION:
 * Route Discovery evaluates "Reasonably Discoverable Corridors". It does not guarantee finding all possible
 * graph combinations if disconnected from observable base-route branches within the strict 5-call OSRM budget.
 */

/**
 * Calculate minimum distance in meters from a coordinate point to a polyline
 */
export function minDistanceToPolyline(
  point: Coordinate,
  polylineCoords: [number, number][]
): number {
  if (!polylineCoords || polylineCoords.length === 0) {
    return Infinity;
  }
  if (polylineCoords.length === 1) {
    return haversineDistanceMeters(point, {
      longitude: polylineCoords[0][0],
      latitude: polylineCoords[0][1],
    });
  }

  let minDistance = Infinity;

  for (let i = 0; i < polylineCoords.length - 1; i++) {
    const pA: Coordinate = { longitude: polylineCoords[i][0], latitude: polylineCoords[i][1] };
    const pB: Coordinate = { longitude: polylineCoords[i + 1][0], latitude: polylineCoords[i + 1][1] };
    const dist = distanceToSegmentMeters(point, pA, pB);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

/**
 * Geodesic distance from a point to a line segment AB
 */
function distanceToSegmentMeters(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const dAB = haversineDistanceMeters(a, b);
  if (dAB === 0) {
    return haversineDistanceMeters(p, a);
  }

  const dAP = haversineDistanceMeters(a, p);
  const dBP = haversineDistanceMeters(b, p);

  // Projection ratio t along AB using planar approximation for local segment
  const cosA = (dAP * dAP + dAB * dAB - dBP * dBP) / (2 * dAP * dAB);
  const t = Math.max(0, Math.min(1, (dAP * cosA) / dAB));

  if (isNaN(t) || t <= 0) return dAP;
  if (t >= 1) return dBP;

  // Interpolated point along AB
  const projLat = a.latitude + t * (b.latitude - a.latitude);
  const projLon = a.longitude + t * (b.longitude - a.longitude);

  return haversineDistanceMeters(p, { latitude: projLat, longitude: projLon });
}

export class CandidateEvaluator {
  private readonly defaultOptions: Required<CandidateEvaluatorOptions> = {
    maxEvaluations: 2,
    maxSnapDistanceMeters: 750,
    minSeparationThresholdMeters: 500,
    regionalDivergenceThresholdMeters: 5000,
    regionalSustainedLengthMeters: 20000,
    duplicateDistanceToleranceMeters: 2500,
    duplicateDurationToleranceSeconds: 180,
  };

  /**
   * Diversified candidate selection selecting at most maxEvaluations candidates
   * across distinct journey stages and geometric orientations.
   */
  public selectDiverseCandidates(
    candidates: BranchCandidate[],
    options?: CandidateEvaluatorOptions
  ): BranchCandidate[] {
    const opts: Required<CandidateEvaluatorOptions> = {
      ...this.defaultOptions,
      ...options,
    };

    if (!candidates || candidates.length === 0) {
      return [];
    }

    // Step 1: Cheap pre-filter to drop trivial or low-confidence candidates
    const viable = candidates.filter((c) => c.score >= 10 && c.deflectionAngle >= 15);
    if (viable.length === 0) {
      return [];
    }

    // Step 2: Bucket candidates by route position stage
    const early = viable.filter((c) => c.fractionAlongRoute <= 0.30);
    const mid = viable.filter((c) => c.fractionAlongRoute > 0.30 && c.fractionAlongRoute <= 0.70);
    const late = viable.filter((c) => c.fractionAlongRoute > 0.70);

    const buckets = [
      { name: 'early', list: early.sort((a, b) => b.score - a.score) },
      { name: 'mid', list: mid.sort((a, b) => b.score - a.score) },
      { name: 'late', list: late.sort((a, b) => b.score - a.score) },
    ].filter((b) => b.list.length > 0);

    const selected: BranchCandidate[] = [];

    // First pick: Best candidate overall
    const sortedAll = [...viable].sort((a, b) => b.score - a.score);
    const bestOverall = sortedAll[0];
    selected.push(bestOverall);

    if (opts.maxEvaluations <= 1) {
      return selected;
    }

    // Second pick: Seek diversity from a different position stage or opposite bearing orientation
    let secondCandidate: BranchCandidate | null = null;

    // Try finding top candidate from a different bucket that is spatially separated
    for (const bucket of buckets) {
      const candidateFromOtherBucket = bucket.list.find(
        (c) =>
          c.id !== bestOverall.id &&
          haversineDistanceMeters(c.seedPoint, bestOverall.seedPoint) >= 15000 &&
          Math.abs(c.fractionAlongRoute - bestOverall.fractionAlongRoute) >= 0.20
      );

      if (candidateFromOtherBucket) {
        secondCandidate = candidateFromOtherBucket;
        break;
      }
    }

    // Fallback if no distinct bucket candidate found: pick best spatially separated candidate
    if (!secondCandidate) {
      secondCandidate =
        sortedAll.find(
          (c) =>
            c.id !== bestOverall.id &&
            haversineDistanceMeters(c.seedPoint, bestOverall.seedPoint) >= 5000
        ) || null;
    }

    if (secondCandidate && selected.length < opts.maxEvaluations) {
      selected.push(secondCandidate);
    }

    return selected;
  }

  /**
   * Evaluates a geometric divergence profile between candidate route and base route
   */
  public calculateRouteDivergence(
    candidateRoute: RawRouteOption,
    baseRoute: RawRouteOption,
    options?: CandidateEvaluatorOptions
  ): RouteDivergenceMetrics {
    const opts: Required<CandidateEvaluatorOptions> = {
      ...this.defaultOptions,
      ...options,
    };

    const baseCoords = baseRoute.geometry?.coordinates || [];
    const candidateCoords = candidateRoute.geometry?.coordinates || [];

    if (candidateCoords.length === 0 || baseCoords.length === 0) {
      return {
        maxDivergenceMeters: 0,
        meanDivergenceMeters: 0,
        sustainedSeparationLengthMeters: 0,
        divergenceRatio: 0,
        classification: 'REDUNDANT_CORRIDOR',
      };
    }

    let maxDivergence = 0;
    let sumDivergence = 0;
    let sustainedSeparationLength = 0;
    let totalSampledLength = 0;

    for (let i = 0; i < candidateCoords.length - 1; i++) {
      const p1: Coordinate = { longitude: candidateCoords[i][0], latitude: candidateCoords[i][1] };
      const p2: Coordinate = { longitude: candidateCoords[i + 1][0], latitude: candidateCoords[i + 1][1] };
      const segLength = haversineDistanceMeters(p1, p2);
      totalSampledLength += segLength;

      const dist = minDistanceToPolyline(p1, baseCoords);
      if (dist > maxDivergence) {
        maxDivergence = dist;
      }
      sumDivergence += dist;

      if (dist >= opts.minSeparationThresholdMeters) {
        sustainedSeparationLength += segLength;
      }
    }

    const meanDivergenceMeters =
      candidateCoords.length > 1 ? Math.round(sumDivergence / (candidateCoords.length - 1)) : 0;
    const divergenceRatio =
      totalSampledLength > 0
        ? Math.round((sustainedSeparationLength / totalSampledLength) * 1000) / 1000
        : 0;

    let classification: DivergenceClassification = 'REDUNDANT_CORRIDOR';

    if (
      maxDivergence >= opts.regionalDivergenceThresholdMeters &&
      (sustainedSeparationLength >= opts.regionalSustainedLengthMeters || divergenceRatio >= 0.25)
    ) {
      classification = 'REGIONAL_ALTERNATIVE';
    } else if (
      maxDivergence >= opts.minSeparationThresholdMeters &&
      sustainedSeparationLength >= 3000
    ) {
      classification = 'LOCAL_HYBRID';
    }

    return {
      maxDivergenceMeters: Math.round(maxDivergence),
      meanDivergenceMeters,
      sustainedSeparationLengthMeters: Math.round(sustainedSeparationLength),
      divergenceRatio,
      classification,
    };
  }

  /**
   * Derive human-centric UX value metrics comparing candidate route against base route
   */
  public deriveUserValueComparison(
    candidateRoute: RawRouteOption,
    baseRoute: RawRouteOption,
    divergence: RouteDivergenceMetrics
  ): UserValueComparison {
    const distDeltaMeters = candidateRoute.distanceMeters - baseRoute.distanceMeters;
    const durationDeltaSeconds = candidateRoute.durationSeconds - baseRoute.durationSeconds;

    const distanceDeltaKm = Math.round((distDeltaMeters / 1000) * 10) / 10;
    const timeDeltaMinutes = Math.round(durationDeltaSeconds / 60);

    const humanReasons: string[] = [];

    if (timeDeltaMinutes <= 0) {
      humanReasons.push(
        timeDeltaMinutes === 0
          ? 'Mismo tiempo estimado de llegada'
          : `Ahorra ${Math.abs(timeDeltaMinutes)} minutos en trayecto`
      );
    } else {
      humanReasons.push(`Añade ${timeDeltaMinutes} minutos adicionales`);
    }

    if (distanceDeltaKm <= 0) {
      humanReasons.push(
        distanceDeltaKm === 0
          ? 'Misma distancia total'
          : `Recorrido más corto por ${Math.abs(distanceDeltaKm)} km`
      );
    } else {
      humanReasons.push(`Recorre ${distanceDeltaKm} km adicionales`);
    }

    if (divergence.classification === 'REGIONAL_ALTERNATIVE') {
      humanReasons.push(
        `Corredor regional independiente (${Math.round(divergence.maxDivergenceMeters / 1000)} km de separación máxima)`
      );
    } else if (divergence.classification === 'LOCAL_HYBRID') {
      humanReasons.push('Desvío intermedio / alternativa local');
    }

    let tradeoffSummary = '';
    if (timeDeltaMinutes <= 0 && distanceDeltaKm <= 0) {
      tradeoffSummary = 'Ruta altamente eficiente (menor tiempo y distancia)';
    } else if (timeDeltaMinutes <= 5 && distanceDeltaKm <= 10) {
      tradeoffSummary = 'Alternativa equilibrada y comparable a la ruta base';
    } else if (timeDeltaMinutes > 0 && distanceDeltaKm > 0) {
      tradeoffSummary = `Ruta con desvío (+${timeDeltaMinutes} min, +${distanceDeltaKm} km)`;
    } else {
      tradeoffSummary = 'Ruta de compromiso entre tiempo y kilometraje';
    }

    return {
      distanceDeltaKm,
      timeDeltaMinutes,
      tradeoffSummary,
      humanReasons,
    };
  }

  /**
   * Determine Pareto status of candidate compared to base route
   */
  public evaluateParetoStatus(
    candidateRoute: RawRouteOption,
    baseRoute: RawRouteOption,
    divergence: RouteDivergenceMetrics
  ): ParetoStatus {
    const timeDelta = candidateRoute.durationSeconds - baseRoute.durationSeconds;
    const distDelta = candidateRoute.distanceMeters - baseRoute.distanceMeters;

    // If strictly faster or shorter
    if (timeDelta <= 0 || distDelta <= 0) {
      return 'RECOMMENDED';
    }

    // If it is a distinct regional corridor or reasonable local hybrid with moderate time increase (< 35 min)
    if (
      divergence.classification !== 'REDUNDANT_CORRIDOR' &&
      timeDelta <= 2100 && // <= 35 min
      distDelta <= 50000 // <= 50 km
    ) {
      return 'REASONABLE';
    }

    // Extreme detour or redundant duplicate with worse time and distance
    return 'DOMINATED';
  }

  /**
   * Check if a candidate route is an identical or redundant duplicate of another route
   */
  public isDuplicateRoute(
    candidateRoute: RawRouteOption,
    baseRoute: RawRouteOption,
    existingRoutes: RawRouteOption[],
    options?: CandidateEvaluatorOptions
  ): boolean {
    const opts: Required<CandidateEvaluatorOptions> = {
      ...this.defaultOptions,
      ...options,
    };

    const routesToCheck = [baseRoute, ...existingRoutes];

    for (const other of routesToCheck) {
      const distDiff = Math.abs(candidateRoute.distanceMeters - other.distanceMeters);
      const durDiff = Math.abs(candidateRoute.durationSeconds - other.durationSeconds);

      if (
        distDiff <= opts.duplicateDistanceToleranceMeters &&
        durDiff <= opts.duplicateDurationToleranceSeconds
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Complete Phase 2 evaluation pipeline transforming BranchCandidate[] into validated RouteCandidate[]
   */
  public async evaluateCandidatePool(
    baseRoute: RawRouteOption,
    origin: Waypoint | Coordinate,
    destination: Waypoint | Coordinate,
    branchCandidates: BranchCandidate[],
    routingProvider: RoutingProvider,
    options?: CandidateEvaluatorOptions
  ): Promise<RouteCandidateEvaluationResult> {
    const opts: Required<CandidateEvaluatorOptions> = {
      ...this.defaultOptions,
      ...options,
    };

    const originWaypoint: Waypoint = {
      latitude: origin.latitude,
      longitude: origin.longitude,
      label: (origin as Waypoint).label,
    };
    const destinationWaypoint: Waypoint = {
      latitude: destination.latitude,
      longitude: destination.longitude,
      label: (destination as Waypoint).label,
    };

    // Diversity selection capping at maxEvaluations
    const selectedBranches = this.selectDiverseCandidates(branchCandidates, opts);

    const evaluatedCandidates: RouteCandidate[] = [];
    const acceptedRouteCandidates: RouteCandidate[] = [];
    const reasons: string[] = [];
    let osrmCallsUsed = 0;
    const maxOsrmBudget = 5; // 1 base + 2 nearest + 2 routes

    reasons.push(`Selected ${selectedBranches.length} diverse candidates for OSRM graph evaluation.`);

    for (const branch of selectedBranches) {
      // Step 1: Query /nearest for road network snap
      let snappedWaypoint: Coordinate = branch.seedPoint;
      let snapDistanceMeters = 0;
      let isSnapAcceptable = true;

      try {
        if (routingProvider.findNearest) {
          osrmCallsUsed++;
          const nearestRes = await routingProvider.findNearest(branch.seedPoint);
          if (nearestRes.snappedPoints && nearestRes.snappedPoints.length > 0) {
            const nearest = nearestRes.snappedPoints[0];
            snappedWaypoint = {
              latitude: nearest.location[1],
              longitude: nearest.location[0],
            };
            snapDistanceMeters = nearest.distanceMeters;
          }
        }
      } catch (err: any) {
        isSnapAcceptable = false;
        reasons.push(`Nearest call failed for branch ${branch.id}: ${err.message}`);
      }

      if (snapDistanceMeters > opts.maxSnapDistanceMeters) {
        isSnapAcceptable = false;
        reasons.push(
          `Branch ${branch.id} rejected: snap distance ${snapDistanceMeters}m > threshold ${opts.maxSnapDistanceMeters}m`
        );
      }

      if (!isSnapAcceptable) {
        continue;
      }

      // Step 2: Query /route O -> W -> D
      let rawRoute: RawRouteOption | null = null;

      try {
        osrmCallsUsed++;
        const routeRes = await routingProvider.calculateRoute({
          origin: originWaypoint,
          destination: destinationWaypoint,
          waypoints: [snappedWaypoint],
        });

        if (routeRes.routes && routeRes.routes.length > 0) {
          rawRoute = routeRes.routes[0];
        }
      } catch (err: any) {
        reasons.push(`Routing exploration failed for branch ${branch.id}: ${err.message}`);
      }

      if (!rawRoute) {
        continue;
      }

      // Step 3: Divergence Analysis & Deduplication
      const divergence = this.calculateRouteDivergence(rawRoute, baseRoute, opts);
      const isDuplicate = this.isDuplicateRoute(
        rawRoute,
        baseRoute,
        acceptedRouteCandidates.map((c) => c.rawRoute),
        opts
      );
      const paretoStatus = this.evaluateParetoStatus(rawRoute, baseRoute, divergence);
      const userValue = this.deriveUserValueComparison(rawRoute, baseRoute, divergence);

      const routeCandidate: RouteCandidate = {
        id: `route_cand_${branch.id}`,
        branchCandidateId: branch.id,
        branchCandidate: branch,
        snappedWaypoint,
        snapDistanceMeters,
        isSnapAcceptable,
        rawRoute,
        divergence,
        paretoStatus,
        userValue,
        isDuplicate,
      };

      evaluatedCandidates.push(routeCandidate);

      if (!isDuplicate && paretoStatus !== 'DOMINATED') {
        acceptedRouteCandidates.push(routeCandidate);
      }
    }

    reasons.push(
      `Evaluation complete: ${acceptedRouteCandidates.length} accepted route candidates discovered using ${osrmCallsUsed} OSRM calls.`
    );

    return {
      baseRoute,
      evaluatedCandidates,
      acceptedRouteCandidates,
      osrmCallsUsed,
      maxOsrmBudget,
      reasons,
    };
  }
}
