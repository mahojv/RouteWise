import { describe, it, expect } from 'vitest';
import {
  CandidateBranchGenerator,
  calculateBearing,
  calculateDeflection,
  haversineDistanceMeters,
  projectCoordinate,
} from '../src/candidate-branch-generator';
import { RawRouteOption } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('CandidateBranchGenerator (Route Discovery Phase 1)', () => {
  const generator = new CandidateBranchGenerator();

  // Synthetic baseline route: moving roughly West to East
  // Origin: lat 20.0, lon -100.0 -> Destination: lat 20.0, lon -98.0 (~208 km)
  const origin = { latitude: 20.0, longitude: -100.0 };
  const destination = { latitude: 20.0, longitude: -98.0 };

  it('Test 1: Una ruta con una bifurcación lateral genera un candidato válido', () => {
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
              name: 'Corridor Main',
              distanceMeters: 200000,
              durationSeconds: 7200,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [
                {
                  location: [-99.0, 20.0],
                  bearings: [90, 150], // 90 is base route straight east, 150 is lateral branch south-east
                  entry: [true, true],
                  out: 0,
                  in: undefined,
                },
              ],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination);

    expect(candidates.length).toBe(1);
    expect(candidates[0].branchBearing).toBe(150);
    expect(candidates[0].deflectionAngle).toBe(60);
    expect(candidates[0].score).toBeGreaterThan(0);
    expect(candidates[0].reasons.length).toBeGreaterThan(0);
    expect(candidates[0].seedPoint).toBeDefined();
    expect(candidates[0].seedPoint.latitude).not.toBe(20.0);
  });

  it('Test 2: Una bifurcación durante el primer 10% de la ruta genera candidato temprano', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 200000,
      durationSeconds: 7200,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 200000,
          durationSeconds: 7200,
          steps: [
            {
              name: 'Segment 1',
              distanceMeters: 10000, // 10 km out of 200 km = 5% of route
              durationSeconds: 360,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-99.9, 20.0],
              ],
              intersections: [
                {
                  location: [-99.95, 20.0],
                  bearings: [90, 45], // 45 deg branch
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
            {
              name: 'Segment 2',
              distanceMeters: 190000,
              durationSeconds: 6840,
              mode: 'driving',
              geometry: [
                [-99.9, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination);

    expect(candidates.length).toBe(1);
    expect(candidates[0].fractionAlongRoute).toBeLessThanOrEqual(0.10);
    expect(candidates[0].reasons.some((r) => r.includes('Early route bifurcation'))).toBe(true);
  });

  it('Test 3: Una bifurcación durante el último 10% de la ruta genera candidato tardío', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 200000,
      durationSeconds: 7200,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 200000,
          durationSeconds: 7200,
          steps: [
            {
              name: 'Segment 1',
              distanceMeters: 185000,
              durationSeconds: 6660,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-98.15, 20.0],
              ],
              intersections: [],
            },
            {
              name: 'Segment 2',
              distanceMeters: 15000, // Remaining 15 km = at 92.5% of route
              durationSeconds: 540,
              mode: 'driving',
              geometry: [
                [-98.15, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [
                {
                  location: [-98.1, 20.0],
                  bearings: [90, 130],
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination);

    expect(candidates.length).toBe(1);
    expect(candidates[0].fractionAlongRoute).toBeGreaterThanOrEqual(0.85);
    expect(candidates[0].reasons.some((r) => r.includes('Late route bifurcation'))).toBe(true);
  });

  it('Test 4: Una rama casi idéntica al bearing de la ruta base (<20°) es descartada como redundante', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 200000,
      durationSeconds: 7200,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 200000,
          durationSeconds: 7200,
          steps: [
            {
              name: 'Collinear Split',
              distanceMeters: 200000,
              durationSeconds: 7200,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [
                {
                  location: [-99.0, 20.0],
                  bearings: [90, 96], // Only 6 deg deflection
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination);
    expect(candidates.length).toBe(0);
  });

  it('Test 5: Una rama que inicialmente se aleja del destino (>90° vs dest) NO es automáticamente descartada', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 200000,
      durationSeconds: 7200,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 200000,
          durationSeconds: 7200,
          steps: [
            {
              name: 'Mountain Bypass Step',
              distanceMeters: 200000,
              durationSeconds: 7200,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [
                {
                  location: [-99.0, 20.0],
                  // Bearing 200 is heading southwest, destination is due east (90 deg), angle diff is 110 deg (> 90 deg)
                  bearings: [90, 200],
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination, {
      maxDetourRatio: 2.5, // Allow detour evaluation
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].branchBearing).toBe(200);
    // Forward alignment is lower but candidate is preserved
    expect(candidates[0].scoreBreakdown.forwardAlignmentScore).toBeGreaterThan(0);
    expect(candidates[0].score).toBeGreaterThan(0);
  });

  it('Test 6: Un candidato con detour geométrico extremo recibe penalización o es descartado', () => {
    const localOrigin = { latitude: 20.0, longitude: -100.0 };
    const localDestination = { latitude: 20.0, longitude: -99.7 }; // ~31.4 km direct

    const baseRoute: RawRouteOption = {
      distanceMeters: 500000,
      durationSeconds: 18000,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-99.7, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 500000,
          durationSeconds: 18000,
          steps: [
            {
              name: 'Extreme Detour Step',
              distanceMeters: 500000,
              durationSeconds: 18000,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-99.7, 20.0],
              ],
              intersections: [
                {
                  location: [-100.0, 20.0],
                  // Bearing 270 (due West, backwards away from destination and origin)
                  bearings: [90, 270],
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    // With standard maxDetourRatio (1.80), this candidate (detour ratio ~2.27) is filtered out
    const candidatesFiltered = generator.generateCandidates(baseRoute, localOrigin, localDestination, {
      maxDetourRatio: 1.80,
    });
    expect(candidatesFiltered.length).toBe(0);

    // With relaxed maxDetourRatio, it receives a heavy detour penalty
    const candidatesRelaxed = generator.generateCandidates(baseRoute, localOrigin, localDestination, {
      maxDetourRatio: 3.0,
    });
    expect(candidatesRelaxed.length).toBe(1);
    expect(candidatesRelaxed[0].scoreBreakdown.detourPenalty).toBeGreaterThan(0);
  });

  it('Test 7: Dos seeds prácticamente iguales se deduplican', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 200000,
      durationSeconds: 7200,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 200000,
          durationSeconds: 7200,
          steps: [
            {
              name: 'Parallel Juncs',
              distanceMeters: 200000,
              durationSeconds: 7200,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [
                {
                  location: [-99.0, 20.0],
                  bearings: [90, 140],
                  entry: [true, true],
                  out: 0,
                },
                {
                  // Intersection 500 meters further along the same bearing
                  location: [-98.995, 20.0],
                  bearings: [90, 140],
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination, {
      deduplicationDistanceMeters: 3000,
    });

    expect(candidates.length).toBe(1);
  });

  it('Test 8: Una ruta con múltiples intersecciones genera múltiples candidatos en distintas ventanas', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 300000,
      durationSeconds: 10800,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-97.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 300000,
          durationSeconds: 10800,
          steps: [
            {
              name: 'Multi-junction Step',
              distanceMeters: 300000,
              durationSeconds: 10800,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-97.0, 20.0],
              ],
              intersections: [
                {
                  location: [-99.8, 20.0], // Early (~7%)
                  bearings: [90, 45],
                  entry: [true, true],
                  out: 0,
                },
                {
                  location: [-98.5, 20.0], // Mid (~50%)
                  bearings: [90, 150],
                  entry: [true, true],
                  out: 0,
                },
                {
                  location: [-97.3, 20.0], // Late (~90%)
                  bearings: [90, 30],
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRoute, origin, destination);

    expect(candidates.length).toBe(3);
    const early = candidates.find((c) => c.fractionAlongRoute <= 0.15);
    const mid = candidates.find((c) => c.fractionAlongRoute >= 0.35 && c.fractionAlongRoute <= 0.65);
    const late = candidates.find((c) => c.fractionAlongRoute >= 0.85);

    expect(early).toBeDefined();
    expect(mid).toBeDefined();
    expect(late).toBeDefined();
  });

  it('Test 9: El resultado es 100% determinista (mismo input produce exactamente los mismos candidatos y orden)', () => {
    const baseRoute: RawRouteOption = {
      distanceMeters: 250000,
      durationSeconds: 9000,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-97.5, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 250000,
          durationSeconds: 9000,
          steps: [
            {
              name: 'Deterministic Step',
              distanceMeters: 250000,
              durationSeconds: 9000,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-97.5, 20.0],
              ],
              intersections: [
                {
                  location: [-99.5, 20.0],
                  bearings: [90, 45, 140],
                  entry: [true, true, true],
                  out: 0,
                },
                {
                  location: [-98.8, 20.0],
                  bearings: [90, 160],
                  entry: [true, true],
                  out: 0,
                },
              ],
            },
          ],
        },
      ],
    };

    const run1 = generator.generateCandidates(baseRoute, origin, destination);
    const run2 = generator.generateCandidates(baseRoute, origin, destination);

    expect(run1).toEqual(run2);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it('Test 10: No existen nombres de ciudades, casetas ni carreteras mexicanas hardcodeadas en el generador', () => {
    const generatorFilePath = path.join(__dirname, '../src/candidate-branch-generator.ts');
    const sourceCode = fs.readFileSync(generatorFilePath, 'utf8').toLowerCase();

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

  it('Test 11 (Limitación Documentada): Documenta explícitamente que no puede descubrir corredores completamente disjuntos sin bifurcaciones observables en la ruta base', () => {
    // A route with zero intersections or branches provides 0 candidates
    const baseRouteWithoutIntersections: RawRouteOption = {
      distanceMeters: 200000,
      durationSeconds: 7200,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.0, 20.0],
          [-98.0, 20.0],
        ],
      },
      legs: [
        {
          distanceMeters: 200000,
          durationSeconds: 7200,
          steps: [
            {
              name: 'Isolated Highway',
              distanceMeters: 200000,
              durationSeconds: 7200,
              mode: 'driving',
              geometry: [
                [-100.0, 20.0],
                [-98.0, 20.0],
              ],
              intersections: [], // No observable branches
            },
          ],
        },
      ],
    };

    const candidates = generator.generateCandidates(baseRouteWithoutIntersections, origin, destination);
    expect(candidates.length).toBe(0);
  });
});
