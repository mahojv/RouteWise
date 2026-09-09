import { describe, it, expect, vi } from 'vitest';
import {
  CandidateEvaluator,
  minDistanceToPolyline,
} from '../src/candidate-evaluator';
import {
  BranchCandidate,
  RawRouteOption,
  RoutingProvider,
  RoutingRequest,
  RoutingResponse,
  NearestResponse,
} from '../src';
import * as fs from 'fs';
import * as path from 'path';

describe('CandidateEvaluator (Route Discovery Phase 2)', () => {
  const evaluator = new CandidateEvaluator();

  const origin = { latitude: 20.0, longitude: -100.0 };
  const destination = { latitude: 20.0, longitude: -98.0 };

  const baseRoute: RawRouteOption = {
    distanceMeters: 200000,
    durationSeconds: 7200,
    geometry: {
      type: 'LineString',
      coordinates: [
        [-100.0, 20.0],
        [-99.0, 20.0],
        [-98.0, 20.0],
      ],
    },
    legs: [
      {
        distanceMeters: 200000,
        durationSeconds: 7200,
        steps: [
          {
            name: 'Base Main Highway',
            distanceMeters: 200000,
            durationSeconds: 7200,
            mode: 'driving',
            geometry: [
              [-100.0, 20.0],
              [-98.0, 20.0],
            ],
          },
        ],
      },
    ],
  };

  const createMockBranch = (
    id: string,
    fractionAlongRoute: number,
    seedPoint: { latitude: number; longitude: number },
    score: number,
    branchBearing = 135,
    deflectionAngle = 45
  ): BranchCandidate => ({
    id,
    originIntersection: { latitude: 20.0, longitude: -100.0 + fractionAlongRoute * 2.0 },
    branchBearing,
    baseRouteBearing: 90,
    deflectionAngle,
    distanceFromOriginKm: fractionAlongRoute * 200,
    seedPoint,
    seedDistanceMeters: 10000,
    sourceStepIndex: 0,
    sourceIntersectionIndex: 0,
    fractionAlongRoute,
    score,
    scoreBreakdown: {
      forwardAlignmentScore: 80,
      spatialDivergencePotential: 75,
      routePositionScore: 80,
      detourPenalty: 0,
      baseScore: score,
      finalScore: score,
    },
    reasons: ['Test branch candidate'],
  });

  it('Test 1: candidate filtering elimina candidatos con scores insignificantes o deflexión nula', () => {
    const candidates: BranchCandidate[] = [
      createMockBranch('b1', 0.1, { latitude: 20.1, longitude: -99.8 }, 5, 90, 5), // Low score and low deflection
      createMockBranch('b2', 0.5, { latitude: 20.3, longitude: -99.0 }, 75, 140, 50), // Viable
    ];

    const selected = evaluator.selectDiverseCandidates(candidates, { maxEvaluations: 2 });
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe('b2');
  });

  it('Test 2 & 3: candidate diversification selecciona candidatos a lo largo de distintas etapas del viaje (early + mid/late)', () => {
    const candidates: BranchCandidate[] = [
      createMockBranch('early_1', 0.10, { latitude: 20.2, longitude: -99.8 }, 85),
      createMockBranch('early_2', 0.12, { latitude: 20.25, longitude: -99.76 }, 84),
      createMockBranch('mid_1', 0.50, { latitude: 20.4, longitude: -99.0 }, 80),
      createMockBranch('late_1', 0.85, { latitude: 20.2, longitude: -98.3 }, 78),
    ];

    const selected = evaluator.selectDiverseCandidates(candidates, { maxEvaluations: 2 });

    expect(selected.length).toBe(2);
    // Best overall is early_1
    expect(selected[0].id).toBe('early_1');
    // Diversified second pick should be from mid or late, not early_2
    expect(selected[1].id).toBe('mid_1');
    expect(selected[1].fractionAlongRoute).toBeGreaterThan(0.30);
  });

  it('Test 4: spatially redundant candidates no son seleccionados conjuntamente', () => {
    const candidates: BranchCandidate[] = [
      createMockBranch('b1', 0.40, { latitude: 20.2, longitude: -99.2 }, 80),
      // b2 is just 200 meters away from b1
      createMockBranch('b2', 0.41, { latitude: 20.201, longitude: -99.201 }, 79),
    ];

    const selected = evaluator.selectDiverseCandidates(candidates, { maxEvaluations: 2 });
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe('b1');
  });

  it('Test 5: candidate with initial movement away from destination (>90°) es evaluado válidamente', () => {
    const branchAway = createMockBranch(
      'mountain_bypass',
      0.30,
      { latitude: 20.3, longitude: -99.4 },
      65,
      210, // Southwest bearing
      120
    );

    const selected = evaluator.selectDiverseCandidates([branchAway], { maxEvaluations: 2 });
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe('mountain_bypass');
  });

  it('Test 6: nearest accepted cuando la distancia de snap está dentro del threshold', async () => {
    const mockProvider: RoutingProvider = {
      name: 'mock',
      findNearest: async () => ({
        provider: 'mock',
        snappedPoints: [{ location: [-99.0, 20.3], distanceMeters: 45 }],
        latencyMs: 2,
      }),
      calculateRoute: async () => ({
        provider: 'mock',
        routes: [baseRoute],
        latencyMs: 5,
      }),
      checkHealth: async () => ({ status: 'ok', latencyMs: 1 }),
    };

    const candidate = createMockBranch('b1', 0.5, { latitude: 20.3, longitude: -99.0 }, 80);
    const result = await evaluator.evaluateCandidatePool(
      baseRoute,
      origin,
      destination,
      [candidate],
      mockProvider,
      { maxSnapDistanceMeters: 750 }
    );

    expect(result.evaluatedCandidates.length).toBe(1);
    expect(result.evaluatedCandidates[0].isSnapAcceptable).toBe(true);
    expect(result.evaluatedCandidates[0].snapDistanceMeters).toBe(45);
  });

  it('Test 7: nearest rejected debido a snap distance excesiva (> threshold)', async () => {
    const mockProvider: RoutingProvider = {
      name: 'mock',
      findNearest: async () => ({
        provider: 'mock',
        // Snapped point is 1500m away in the wilderness
        snappedPoints: [{ location: [-99.0, 20.3], distanceMeters: 1500 }],
        latencyMs: 2,
      }),
      calculateRoute: async () => ({
        provider: 'mock',
        routes: [baseRoute],
        latencyMs: 5,
      }),
      checkHealth: async () => ({ status: 'ok', latencyMs: 1 }),
    };

    const candidate = createMockBranch('b1', 0.5, { latitude: 20.3, longitude: -99.0 }, 80);
    const result = await evaluator.evaluateCandidatePool(
      baseRoute,
      origin,
      destination,
      [candidate],
      mockProvider,
      { maxSnapDistanceMeters: 750 }
    );

    // /route is skipped for unacceptable snap
    expect(result.acceptedRouteCandidates.length).toBe(0);
    expect(result.reasons.some((r) => r.includes('snap distance 1500m > threshold 750m'))).toBe(true);
  });

  it('Test 8: route candidate generated con métricas completas y estructura validada', async () => {
    const alternativeRoute: RawRouteOption = {
      distanceMeters: 215000,
      durationSeconds: 7800,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-99.0, 20.35], // Separated lateral arc
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 215000,
          durationSeconds: 7800,
          steps: [],
        },
      ],
    };

    const mockProvider: RoutingProvider = {
      name: 'mock',
      findNearest: async () => ({
        provider: 'mock',
        snappedPoints: [{ location: [-99.0, 20.35], distanceMeters: 50 }],
        latencyMs: 2,
      }),
      calculateRoute: async () => ({
        provider: 'mock',
        routes: [alternativeRoute],
        latencyMs: 5,
      }),
      checkHealth: async () => ({ status: 'ok', latencyMs: 1 }),
    };

    const candidate = createMockBranch('b1', 0.5, { latitude: 20.35, longitude: -99.0 }, 85);
    const result = await evaluator.evaluateCandidatePool(
      baseRoute,
      origin,
      destination,
      [candidate],
      mockProvider
    );

    expect(result.acceptedRouteCandidates.length).toBe(1);
    const cand = result.acceptedRouteCandidates[0];
    expect(cand.divergence.maxDivergenceMeters).toBeGreaterThan(10000);
    expect(cand.userValue.distanceDeltaKm).toBe(15);
    expect(cand.userValue.timeDeltaMinutes).toBe(10);
  });

  it('Test 9: failed candidate does not abort discovery (resiliencia)', async () => {
    let callCount = 0;
    const mockProvider: RoutingProvider = {
      name: 'mock',
      findNearest: async (pt) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('OSRM 500 Network Timeout');
        }
        return {
          provider: 'mock',
          snappedPoints: [{ location: [pt.longitude, pt.latitude], distanceMeters: 20 }],
          latencyMs: 1,
        };
      },
      calculateRoute: async () => ({
        provider: 'mock',
        routes: [
          {
            distanceMeters: 210000,
            durationSeconds: 7500,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.0, 20.0],
                [-99.0, 20.2],
                [-98.0, 20.0],
              ],
            },
            legs: [],
          },
        ],
        latencyMs: 5,
      }),
      checkHealth: async () => ({ status: 'ok', latencyMs: 1 }),
    };

    const candidates = [
      createMockBranch('b_fail', 0.2, { latitude: 20.2, longitude: -99.6 }, 90),
      createMockBranch('b_ok', 0.6, { latitude: 20.2, longitude: -98.8 }, 85),
    ];

    const result = await evaluator.evaluateCandidatePool(
      baseRoute,
      origin,
      destination,
      candidates,
      mockProvider
    );

    // The failing candidate was discarded gracefully, and the second one completed
    expect(result.acceptedRouteCandidates.length).toBe(1);
    expect(result.acceptedRouteCandidates[0].branchCandidateId).toBe('b_ok');
  });

  it('Test 10: duplicate route detection identifica rutas colineales o idénticas a la ruta base', () => {
    const identicalRoute: RawRouteOption = {
      distanceMeters: 200500, // Within 500m
      durationSeconds: 7230, // Within 30s
      geometry: baseRoute.geometry,
      legs: [],
    };

    const isDup = evaluator.isDuplicateRoute(identicalRoute, baseRoute, []);
    expect(isDup).toBe(true);
  });

  it('Test 11: divergence classification distingue REDUNDANT, LOCAL_HYBRID y REGIONAL_ALTERNATIVE', () => {
    // 1. Redundant micro-variant
    const redundantRoute: RawRouteOption = {
      distanceMeters: 200100,
      durationSeconds: 7210,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-99.0, 20.001], // ~110m divergence
          [-98.0, 20.0],
        ],
      },
      legs: [],
    };
    const divRedundant = evaluator.calculateRouteDivergence(redundantRoute, baseRoute);
    expect(divRedundant.classification).toBe('REDUNDANT_CORRIDOR');

    // 2. Local Hybrid (moderate divergence e.g. 2-3 km)
    const localHybridRoute: RawRouteOption = {
      distanceMeters: 204000,
      durationSeconds: 7400,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-99.5, 20.0],
          [-99.0, 20.02], // ~2.2 km divergence
          [-98.5, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [],
    };
    const divHybrid = evaluator.calculateRouteDivergence(localHybridRoute, baseRoute);
    expect(divHybrid.classification).toBe('LOCAL_HYBRID');

    // 3. Regional Alternative (deep sustained lateral separation e.g. >20 km)
    const regionalRoute: RawRouteOption = {
      distanceMeters: 230000,
      durationSeconds: 8400,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-99.5, 20.3],
          [-99.0, 20.4], // ~44 km lateral separation
          [-98.5, 20.3],
          [-98.0, 20.0],
        ],
      },
      legs: [],
    };
    const divRegional = evaluator.calculateRouteDivergence(regionalRoute, baseRoute);
    expect(divRegional.classification).toBe('REGIONAL_ALTERNATIVE');
    expect(divRegional.maxDivergenceMeters).toBeGreaterThan(20000);
  });

  it('Test 12: deterministic selection produce exactamente el mismo resultado con idéntico input', () => {
    const candidates: BranchCandidate[] = [
      createMockBranch('b1', 0.2, { latitude: 20.2, longitude: -99.6 }, 80),
      createMockBranch('b2', 0.5, { latitude: 20.3, longitude: -99.0 }, 85),
      createMockBranch('b3', 0.8, { latitude: 20.1, longitude: -98.4 }, 75),
    ];

    const run1 = evaluator.selectDiverseCandidates(candidates, { maxEvaluations: 2 });
    const run2 = evaluator.selectDiverseCandidates(candidates, { maxEvaluations: 2 });

    expect(run1).toEqual(run2);
  });

  it('Test 13: max OSRM call budget está garantizado por la orquestación (<= 5 llamadas)', async () => {
    let osrmCalls = 0;
    const mockProvider: RoutingProvider = {
      name: 'mock',
      findNearest: async (pt) => {
        osrmCalls++;
        return {
          provider: 'mock',
          snappedPoints: [{ location: [pt.longitude, pt.latitude], distanceMeters: 10 }],
          latencyMs: 1,
        };
      },
      calculateRoute: async () => {
        osrmCalls++;
        return {
          provider: 'mock',
          routes: [baseRoute],
          latencyMs: 5,
        };
      },
      checkHealth: async () => ({ status: 'ok', latencyMs: 1 }),
    };

    // Pool of 10 candidates
    const pool = Array.from({ length: 10 }, (_, i) =>
      createMockBranch(`cand_${i}`, (i + 1) * 0.08, { latitude: 20.1 + i * 0.02, longitude: -99.8 + i * 0.15 }, 80 - i)
    );

    const result = await evaluator.evaluateCandidatePool(baseRoute, origin, destination, pool, mockProvider, {
      maxEvaluations: 2,
    });

    // 2 candidates evaluated: 2 nearest calls + 2 route calls = 4 calls (within budget <= 5)
    expect(result.osrmCallsUsed).toBeLessThanOrEqual(5);
    expect(osrmCalls).toBe(4);
  });

  it('Test 14: no existen nombres de ciudades, estados ni corredores mexicanos en el código del evaluador', () => {
    const evaluatorFilePath = path.join(__dirname, '../src/candidate-evaluator.ts');
    const sourceCode = fs.readFileSync(evaluatorFilePath, 'utf8').toLowerCase();

    const prohibitedTerms = [
      'queretaro',
      'querétaro',
      'mexico',
      'méxico',
      'cdmx',
      'palmillas',
      'tepeji',
      'apizaco',
      'tlaxcala',
      'puebla',
      'veracruz',
      'minatitlan',
      'minatitlán',
      'arco norte',
      'mex-57',
      'mex-136',
      'mex-140',
      'mex-150',
      'capufe',
      'caseta',
    ];

    for (const term of prohibitedTerms) {
      expect(sourceCode.includes(term)).toBe(false);
    }
  });

  it('Test 15: human-readable value metrics se derivan directamente de los datos de ruta', () => {
    const alternativeRoute: RawRouteOption = {
      distanceMeters: 212000, // +12 km
      durationSeconds: 6300, // -15 min (faster!)
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-99.0, 20.3],
          [-98.0, 20.0],
        ],
      },
      legs: [],
    };

    const divergence = evaluator.calculateRouteDivergence(alternativeRoute, baseRoute);
    const userValue = evaluator.deriveUserValueComparison(alternativeRoute, baseRoute, divergence);

    expect(userValue.distanceDeltaKm).toBe(12);
    expect(userValue.timeDeltaMinutes).toBe(-15);
    expect(userValue.humanReasons.some((r) => r.includes('Ahorra 15 minutos'))).toBe(true);
    expect(userValue.humanReasons.some((r) => r.includes('Recorre 12 km adicionales'))).toBe(true);
  });
});
