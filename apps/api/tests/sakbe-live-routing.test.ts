import { describe, it, expect } from 'vitest';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import { InegiLiveSyncService, InegiLiveSyncResult } from '../src/modules/tolls/inegi-live-sync.service';
import { SakbeTollParserService } from '../src/modules/tolls/sakbe-toll-parser.service';
import { TollMatcherService } from '../src/modules/tolls/toll-matcher.service';
import { MockRoutingProvider, RoutingRequest, RoutingResponse } from '@routewise/routing';
import { TollEvent } from '@routewise/types';

describe('SAKBE Live Routing & Toll Assessment Tests (Rigorous Toll Validation)', () => {
  const parser = new SakbeTollParserService();

  it('1. Caseta existente solo en SAKBÉ detectada en ruta OSRM alternativa con DB vacía', async () => {
    // SAKBÉ descubrió la caseta "Caseta Regional Norte" en la sesión actual
    const sessionToll: TollEvent = {
      id: 'sakbe-toll-1',
      tollPlazaId: 'plaza-regional-norte',
      name: 'Caseta Regional Norte',
      operator: 'CAPUFE',
      latitude: 20.3069,
      longitude: -99.9349,
      price: 120.0,
      priceStatus: 'VALID',
      routePosition: 0.35,
    };

    const matcher = new TollMatcherService();
    // Geometría alternativa generada por OSRM que pasa cerca de la caseta descubierta
    const osrmAlternativeCoords: [number, number][] = [
      [-100.3899, 20.5888],
      [-99.9349, 20.3069], // Pasa por la caseta descubierta
      [-99.1332, 19.4326],
    ];

    const matched = await matcher.matchTollsAlongRoute(osrmAlternativeCoords, {
      sessionTolls: [sessionToll],
    });

    expect(matched.length).toBe(1);
    expect(matched[0].name).toBe('Caseta Regional Norte');
    expect(matched[0].price).toBe(120.0);
    expect(matched[0].priceStatus).toBe('VALID');
  });

  it('2. Ruta OSRM sin casetas conocidas pero con evidencia de peaje (isToll: true) termina en UNVERIFIED_TOLL con price null (NUNCA $0)', async () => {
    const mockProvider = {
      name: 'mock-provider',
      latencyMs: 1,
      calculateRoute: async (): Promise<RoutingResponse> => ({
        provider: 'mock-provider',
        latencyMs: 1,
        routes: [
          {
            distanceMeters: 150000,
            durationSeconds: 6000,
            geometry: {
              type: 'LineString',
              coordinates: [
                [-100.0, 20.0],
                [-99.5, 19.5],
              ],
            },
            legs: [
              {
                distanceMeters: 150000,
                durationSeconds: 6000,
                steps: [
                  {
                    name: 'Autopista Concesionada Sin Registro en BD',
                    distanceMeters: 150000,
                    durationSeconds: 6000,
                    mode: 'driving',
                    isToll: true, // Evidencia explícita de peaje
                    geometry: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
      checkHealth: async () => ({ status: 'ok' as const, latencyMs: 1 }),
    };

    const emptyLiveSync = {
      syncLiveTariffs: async (): Promise<InegiLiveSyncResult> => ({
        liveTollsFound: 0,
        cuotaTollsFound: 0,
        libreTollsFound: 0,
        cuotaEvents: [],
        libreEvents: [],
        updatedPrices: new Map(),
      }),
    } as unknown as InegiLiveSyncService;

    const optimizer = new RouteOptimizationService(
      undefined,
      new TollMatcherService(undefined, []), // Sin casetas en BD
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockProvider,
      undefined,
      undefined,
      emptyLiveSync
    );

    const res = await optimizer.optimizeRoute({
      origin: { latitude: 20.0, longitude: -100.0 },
      destination: { latitude: 19.5, longitude: -99.5 },
    });

    const route = res.routes[0];
    expect(route).toBeDefined();
    // NO debe declararse NO_TOLL
    expect(route.cost.hasUnknownTolls).toBe(true);
    expect(route.tolls.length).toBe(1);
    expect(route.tolls[0].price).toBeNull();
    expect(route.tolls[0].price).not.toBe(0);
    expect(route.tolls[0].priceStatus).toBe('UNKNOWN');
  });

  it('3. Ruta SAKBÉ detalle_l confirmada como libre termina en NO_TOLL con $0', async () => {
    const mockProvider = new MockRoutingProvider();

    const mockLiveSync = {
      syncLiveTariffs: async (): Promise<InegiLiveSyncResult> => ({
        liveTollsFound: 1,
        cuotaTollsFound: 1,
        libreTollsFound: 0,
        cuotaEvents: [
          {
            id: 'cuota-1',
            tollPlazaId: 'plaza-1',
            name: 'Caseta Cuota',
            operator: 'CAPUFE',
            latitude: 20.3069,
            longitude: -99.9349,
            price: 108.0,
            priceStatus: 'VALID',
            routePosition: 0.3,
          },
        ],
        libreEvents: [], // detalle_l confirmó 0 casetas
        updatedPrices: new Map([['Caseta Cuota', 108]]),
        totalCuotaCost: 108,
        totalLibreCost: 0,
      }),
    } as unknown as InegiLiveSyncService;

    const optimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockProvider,
      undefined,
      undefined,
      mockLiveSync
    );

    const res = await optimizer.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const freeRoute = res.routes.find((r) => r.id === 'route-free');
    if (freeRoute) {
      expect(freeRoute.type).toBe('NO_TOLL');
      expect(freeRoute.tollCost).toBe(0);
      expect(freeRoute.cost.hasUnknownTolls).toBe(false);
      expect(freeRoute.tolls.length).toBe(0);
    }
  });

  it('4. Bypass que se aleja físicamente (> 250m) de la caseta objetivo es aceptado', async () => {
    const targetToll: TollEvent = {
      id: 'target-toll-1',
      tollPlazaId: 'plaza-palmillas',
      name: 'Caseta Palmillas',
      operator: 'CAPUFE',
      latitude: 20.3069,
      longitude: -99.9349,
      price: 108,
      priceStatus: 'VALID',
      routePosition: 0.3,
    };

    // Proveedor que devuelve rutas diferenciadas para FAST, Ruta Libre por anchors e Híbrida por bypass
    const mockDivergedProvider = {
      name: 'diverged-provider',
      latencyMs: 1,
      calculateRoute: async (req: RoutingRequest): Promise<RoutingResponse> => {
        const isBypass =
          req.waypoints &&
          req.waypoints.length === 2 &&
          Math.abs(req.waypoints[0].longitude - -100.0200) < 0.001 &&
          Math.abs(req.waypoints[0].latitude - 20.3500) < 0.001 &&
          Math.abs(req.waypoints[1].longitude - -99.9800) < 0.001 &&
          Math.abs(req.waypoints[1].latitude - 20.2500) < 0.001;

        if (isBypass) {
          return {
            provider: 'diverged-provider',
            latencyMs: 1,
            routes: [
              {
                distanceMeters: 220000,
                durationSeconds: 11000,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-100.3899, 20.5888],
                    [-100.0200, 20.3500], // Desvío libre (~6 km al poniente de Palmillas)
                    [-99.9800, 20.2500],
                    [-99.1332, 19.4326],
                  ],
                },
                legs: [
                  {
                    distanceMeters: 220000,
                    durationSeconds: 11000,
                    steps: [],
                  },
                ],
              },
            ],
          };
        }

        // Llamada de Ruta Libre Base por FreeCorridorAnchor (vía Huichapan / Teoloyucan)
        const isFreeAnchorCall = req.waypoints && req.waypoints.length >= 1 && !isBypass;
        if (isFreeAnchorCall) {
          return {
            provider: 'diverged-provider',
            latencyMs: 1,
            routes: [
              {
                distanceMeters: 265000,
                durationSeconds: 14500,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [-100.3899, 20.5888],
                    [-99.6521, 20.3742],
                    [-99.1650, 19.7480],
                    [-99.1332, 19.4326],
                  ],
                },
                legs: [
                  {
                    distanceMeters: 265000,
                    durationSeconds: 14500,
                    steps: [],
                  },
                ],
              },
            ],
          };
        }

        // FAST Base (sin waypoints)
        return {
          provider: 'diverged-provider',
          latencyMs: 1,
          routes: [
            {
              distanceMeters: 212000,
              durationSeconds: 10000,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [-100.3899, 20.5888],
                  [-99.9349, 20.3069], // Paso por Palmillas en FAST
                  [-99.1332, 19.4326],
                ],
              },
              legs: [
                {
                  distanceMeters: 212000,
                  durationSeconds: 10000,
                  steps: [],
                },
              ],
            },
          ],
        };
      },
      checkHealth: async () => ({ status: 'ok' as const, latencyMs: 1 }),
    };

    const mockLiveSync = {
      syncLiveTariffs: async (): Promise<InegiLiveSyncResult> => ({
        liveTollsFound: 1,
        cuotaTollsFound: 1,
        libreTollsFound: 0,
        cuotaEvents: [targetToll],
        libreEvents: [],
        updatedPrices: new Map([['Caseta Palmillas', 108]]),
        totalCuotaCost: 108,
      }),
    } as unknown as InegiLiveSyncService;

    const mockResolver = {
      resolveBypass: async () => ({
        tollPlazaId: 'plaza-palmillas',
        exitPoint: { latitude: 20.3500, longitude: -100.0200 },
        reentryPoint: { latitude: 20.2500, longitude: -99.9800 },
        exitDistanceMeters: 50000,
        reentryDistanceMeters: 60000,
        confidence: 0.9,
        source: 'CURATED' as const,
        isVerified: true,
      }),
    };

    const optimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockResolver as any,
      undefined,
      undefined,
      mockDivergedProvider,
      undefined,
      undefined,
      mockLiveSync
    );

    const res = await optimizer.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const hybridRoute = res.routes.find((r) => r.id.startsWith('route-hybrid'));
    expect(hybridRoute).toBeDefined();
    expect(hybridRoute?.tolls.some((t) => t.tollPlazaId === 'plaza-palmillas')).toBe(false);
  });

  it('5. Bypass que aún pasa cerca (<= 250m) de la caseta objetivo es rechazado y no se presenta como híbrida exitosa', async () => {
    const targetToll: TollEvent = {
      id: 'target-toll-1',
      tollPlazaId: 'plaza-palmillas',
      name: 'Caseta Palmillas',
      operator: 'CAPUFE',
      latitude: 20.3069,
      longitude: -99.9349,
      price: 108,
      priceStatus: 'VALID',
      routePosition: 0.3,
    };

    // Proveedor que finge un desvío pero la geometría sigue pasando a 50 metros de Palmillas
    const mockNearProvider = {
      name: 'near-provider',
      latencyMs: 1,
      calculateRoute: async (req: RoutingRequest): Promise<RoutingResponse> => {
        const isBypass = req.waypoints && req.waypoints.length === 2;
        return {
          provider: 'near-provider',
          latencyMs: 1,
          routes: [
            {
              distanceMeters: 215000,
              durationSeconds: 10500,
              geometry: {
                type: 'LineString',
                coordinates: isBypass
                  ? [
                      [-100.3899, 20.5888],
                      [-99.9350, 20.3070], // Pasa a ~15 metros de Palmillas (NO evadida)
                      [-99.1332, 19.4326],
                    ]
                  : [
                      [-100.3899, 20.5888],
                      [-99.9349, 20.3069],
                      [-99.1332, 19.4326],
                    ],
              },
              legs: [
                {
                  distanceMeters: 215000,
                  durationSeconds: 10500,
                  steps: [],
                },
              ],
            },
          ],
        };
      },
      checkHealth: async () => ({ status: 'ok' as const, latencyMs: 1 }),
    };

    const mockLiveSync = {
      syncLiveTariffs: async (): Promise<InegiLiveSyncResult> => ({
        liveTollsFound: 1,
        cuotaTollsFound: 1,
        libreTollsFound: 0,
        cuotaEvents: [targetToll],
        libreEvents: [],
        updatedPrices: new Map([['Caseta Palmillas', 108]]),
        totalCuotaCost: 108,
      }),
    } as unknown as InegiLiveSyncService;

    const mockResolver = {
      resolveBypass: async () => ({
        tollPlazaId: 'plaza-palmillas',
        exitPoint: { latitude: 20.3070, longitude: -99.9350 },
        reentryPoint: { latitude: 20.3069, longitude: -99.9349 },
        exitDistanceMeters: 50000,
        reentryDistanceMeters: 50100,
        confidence: 0.9,
        source: 'CURATED' as const,
        isVerified: true,
      }),
    };

    const optimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockResolver as any,
      undefined,
      undefined,
      mockNearProvider,
      undefined,
      undefined,
      mockLiveSync
    );

    const res = await optimizer.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const hybridRoute = res.routes.find((r) => r.id.startsWith('route-hybrid'));
    // El bypass falló la verificación física y debe ser descartado
    expect(hybridRoute).toBeUndefined();
  });

  it('6. Deduplicación espacial: SAKBÉ vivo tiene prioridad sobre registro legacy', async () => {
    const liveSakbeToll: TollEvent = {
      id: 'sakbe-toll-live',
      tollPlazaId: 'plaza-palmillas-live',
      name: 'Caseta Palmillas (Tarifa Viva 2026)',
      operator: 'CAPUFE',
      latitude: 20.3069,
      longitude: -99.9349,
      price: 115.0,
      priceStatus: 'VALID',
      routePosition: 0.25,
    };

    const legacyDbPlaza: TollEvent = {
      id: 'plaza-palmillas-legacy',
      tollPlazaId: 'plaza-palmillas-legacy',
      name: 'Caseta Palmillas Antigua',
      operator: 'CAPUFE',
      latitude: 20.3070, // a 11 metros
      longitude: -99.9350,
      price: 90.0,
      priceStatus: 'OUTDATED',
      routePosition: 0.25,
    };

    const matcher = new TollMatcherService(undefined, [legacyDbPlaza]);
    const coords: [number, number][] = [
      [-100.3899, 20.5888],
      [-99.9349, 20.3069],
      [-99.1332, 19.4326],
    ];

    const matched = await matcher.matchTollsAlongRoute(coords, {
      sessionTolls: [liveSakbeToll],
    });

    expect(matched.length).toBe(1);
    expect(matched[0].name).toContain('Tarifa Viva 2026');
    expect(matched[0].price).toBe(115.0);
  });

  it('7. Preservación estricta de price null para UNKNOWN en RouteOption', async () => {
    const unknownToll: TollEvent = {
      id: 'sakbe-toll-unknown',
      tollPlazaId: 'plaza-unknown',
      name: 'Caseta Sin Tarifa',
      operator: 'CAPUFE',
      latitude: 20.3069,
      longitude: -99.9349,
      price: null,
      priceStatus: 'UNKNOWN',
      routePosition: 0.25,
    };

    const mockLiveSync = {
      syncLiveTariffs: async (): Promise<InegiLiveSyncResult> => ({
        liveTollsFound: 1,
        cuotaTollsFound: 1,
        libreTollsFound: 0,
        cuotaEvents: [unknownToll],
        libreEvents: [],
        updatedPrices: new Map(),
      }),
    } as unknown as InegiLiveSyncService;

    const optimizer = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new MockRoutingProvider(),
      undefined,
      undefined,
      mockLiveSync
    );

    const res = await optimizer.optimizeRoute({
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
    });

    const fastRoute = res.routes.find((r) => r.id === 'route-fast');
    expect(fastRoute).toBeDefined();
    expect(fastRoute?.tolls[0].price).toBeNull();
    expect(fastRoute?.tolls[0].price).not.toBe(0);
    expect(fastRoute?.cost.hasUnknownTolls).toBe(true);
  });
});
