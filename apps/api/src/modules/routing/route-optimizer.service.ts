import {
  RouteCalculationRequest,
  RouteCalculationResponse,
  RouteOption,
  RouteSegment,
  RouteType,
  CostBreakdown,
  RouteComparison,
  RouteExplanation,
  TollEvent,
  TollBypassCandidate,
  Coordinate,
} from '@routewise/types';
import { DEFAULT_CONFIG } from '@routewise/config';
import { getRoutingProvider } from '../../providers';
import {
  MockRoutingProvider,
  RoutingProvider,
  RawRouteOption,
  CandidateBranchGenerator,
  CandidateEvaluator,
} from '@routewise/routing';
import { TollsService } from '../tolls/tolls.service';
import { TollMatcherService } from '../tolls/toll-matcher.service';
import { TollCostService } from '../tolls/toll-cost.service';
import { FuelCostService } from './services/fuel-cost.service';
import { TimeCostService } from './services/time-cost.service';
import {
  TollBypassResolverService,
  getCumulativeDistanceToPoint,
} from '../tolls/toll-bypass-resolver.service';
import {
  CriticalTollSelectorService,
  ResolvedTollBypass,
} from './services/critical-toll-selector.service';
import { FreeCorridorAnchorService } from './services/free-corridor-anchor.service';
import { getDb } from '../../database';
import { routeSearches } from '../../database/schema';

/**
 * Valida localmente si una geometría de ruta pasa cerca de todos los waypoints indicados (tolerancia <= 200m)
 */
export function routePassesThroughWaypoints(
  routeCoords: [number, number][],
  waypoints: Coordinate[],
  toleranceMeters = 200
): boolean {
  if (!routeCoords || routeCoords.length === 0 || !waypoints || waypoints.length === 0) {
    return false;
  }

  for (const wp of waypoints) {
    const loc = getCumulativeDistanceToPoint(wp, routeCoords);
    if (loc.minDistanceToPolyline > toleranceMeters) {
      return false;
    }
  }

  return true;
}

/**
 * Clasifica la tipología de una ruta según su estructura vial, casetas y origen
 */
export function classifyRoute(
  rawRoute: RawRouteOption,
  detectedTolls: TollEvent[],
  isBypassRoute = false
): RouteType {
  // 1. Si es una ruta generada por bypass (combina tramos libres de desvío con tramos de la ruta principal)
  if (isBypassRoute) {
    return 'HYBRID';
  }

  // 2. Si no tiene casetas detectadas
  if (detectedTolls.length === 0) {
    return 'NO_TOLL';
  }

  // 3. Si tiene casetas y transitó por autopistas sin bypasses
  return 'FAST';
}

export class RouteOptimizationService {
  private tollsService: TollsService;
  private tollMatcher: TollMatcherService;
  private tollCostService: TollCostService;
  private fuelCostService: FuelCostService;
  private timeCostService: TimeCostService;
  private tollBypassResolver: TollBypassResolverService;
  private criticalTollSelector: CriticalTollSelectorService;
  private freeCorridorAnchor: FreeCorridorAnchorService;
  private branchGenerator: CandidateBranchGenerator;
  private candidateEvaluator: CandidateEvaluator;
  private routingProviderOverride?: RoutingProvider;

  constructor(
    tollsService?: TollsService,
    tollMatcher?: TollMatcherService,
    tollCostService?: TollCostService,
    fuelCostService?: FuelCostService,
    timeCostService?: TimeCostService,
    tollBypassResolver?: TollBypassResolverService,
    criticalTollSelector?: CriticalTollSelectorService,
    freeCorridorAnchor?: FreeCorridorAnchorService,
    routingProviderOverride?: RoutingProvider,
    branchGenerator?: CandidateBranchGenerator,
    candidateEvaluator?: CandidateEvaluator
  ) {
    this.tollsService = tollsService || new TollsService();
    this.tollCostService = tollCostService || new TollCostService();
    this.tollMatcher = tollMatcher || new TollMatcherService(this.tollCostService);
    this.fuelCostService = fuelCostService || new FuelCostService();
    this.timeCostService = timeCostService || new TimeCostService();
    this.tollBypassResolver = tollBypassResolver || new TollBypassResolverService();
    this.criticalTollSelector = criticalTollSelector || new CriticalTollSelectorService();
    this.freeCorridorAnchor = freeCorridorAnchor || new FreeCorridorAnchorService();
    this.branchGenerator = branchGenerator || new CandidateBranchGenerator();
    this.candidateEvaluator = candidateEvaluator || new CandidateEvaluator();
    this.routingProviderOverride = routingProviderOverride;
  }

  public async optimizeRoute(request: RouteCalculationRequest): Promise<RouteCalculationResponse> {
    const routingProvider = this.routingProviderOverride || getRoutingProvider();

    const fuelConsumption = request.vehicle?.fuelConsumption ?? DEFAULT_CONFIG.defaultFuelConsumption;
    const fuelPrice = request.vehicle?.fuelPrice ?? DEFAULT_CONFIG.defaultFuelPrice;
    const vehicleType = request.vehicle?.vehicleType ?? 'automovil';
    const preferenceMode = request.preferences?.mode ?? 'BALANCED';
    const timeValue = request.preferences?.timeValue ?? DEFAULT_CONFIG.defaultTimeValue;
    const avoidTollIds = request.avoidTollPlazaIds || [];

    let osrmCallsCount = 0;
    const rawCandidates: RouteOption[] = [];

    // =========================================================================
    // LLAMADA 1: Ruta Rápida Base (Fast Base con alternatives)
    // =========================================================================
    let fastRoutingRes;
    try {
      fastRoutingRes = await routingProvider.calculateRoute({
        origin: request.origin,
        destination: request.destination,
        alternatives: 3,
      });
      osrmCallsCount++;
    } catch {
      const fallbackProvider = new MockRoutingProvider();
      fastRoutingRes = await fallbackProvider.calculateRoute({
        origin: request.origin,
        destination: request.destination,
        alternatives: 3,
      });
      osrmCallsCount++;
    }

    const fastRawRoute = fastRoutingRes.routes[0];
    const fastHighwayHints = this.extractHighwayHints(fastRawRoute);

    // =========================================================================
    // SINCRONIZACIÓN EN TIEMPO REAL CON INEGI SAKBE (Live Tariffs Sync en Producción/Dev)
    // =========================================================================
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      try {
        const inegiLiveSync = new (await import('../tolls/inegi-live-sync.service')).InegiLiveSyncService();
        await inegiLiveSync.syncLiveTariffs(request.origin, request.destination, vehicleType);
      } catch {
        // Si la llamada externa a INEGI falla o no hay conexión, continuar con la DB local
      }
    }

    const fastTolls = await this.tollMatcher.matchTollsAlongRoute(
      fastRawRoute.geometry.coordinates,
      {
        radiusMeters: DEFAULT_CONFIG.tollMatchingRadiusMeters,
        vehicleType,
        highwayHints: fastHighwayHints,
        avoidTollIds,
      }
    );

    const activeFastTolls = fastTolls.filter((e) => !e.isAvoided && !avoidTollIds.includes(e.tollPlazaId));
    const fastCategory = classifyRoute(fastRawRoute, activeFastTolls, false);

    const fastOption = this.enrichRouteOption({
      id: 'route-fast',
      rawRoute: fastRawRoute,
      tolls: activeFastTolls,
      type: fastCategory,
      fuelConsumption,
      fuelPrice,
      timeValue,
      preferenceMode,
    });

    rawCandidates.push(fastOption);

    // =========================================================================
    // LLAMADA 2: Ruta Libre Base (Free Base)
    // =========================================================================
    let freeBaseRawRoute: RawRouteOption | null = null;

    // 1. Revisar si alguna alternativa devuelta es 100% libre según TollMatcher
    for (let i = 1; i < fastRoutingRes.routes.length; i++) {
      const altRoute = fastRoutingRes.routes[i];
      const altHints = this.extractHighwayHints(altRoute);
      const altTolls = await this.tollMatcher.matchTollsAlongRoute(altRoute.geometry.coordinates, {
        radiusMeters: DEFAULT_CONFIG.tollMatchingRadiusMeters,
        vehicleType,
        highwayHints: altHints,
        avoidTollIds,
      });

      if (altTolls.length === 0) {
        freeBaseRawRoute = altRoute;
        break;
      }
    }

    // 2. Si no hay alternativa libre nativa, consultar anchor point (1 llamada adicional)
    if (!freeBaseRawRoute && osrmCallsCount < 5) {
      const anchors = await this.freeCorridorAnchor.getAnchors(request.origin, request.destination);
      if (anchors && anchors.length > 0) {
        try {
          const freeRes = await routingProvider.calculateRoute({
            origin: request.origin,
            destination: request.destination,
            waypoints: anchors,
          });
          osrmCallsCount++;

          if (freeRes.routes.length > 0) {
            const freeRouteCandidate = freeRes.routes[0];
            const freeHints = this.extractHighwayHints(freeRouteCandidate);
            const tolls = await this.tollMatcher.matchTollsAlongRoute(
              freeRouteCandidate.geometry.coordinates,
              {
                radiusMeters: DEFAULT_CONFIG.tollMatchingRadiusMeters,
                vehicleType,
                highwayHints: freeHints,
                avoidTollIds,
              }
            );

            if (tolls.length === 0) {
              freeBaseRawRoute = freeRouteCandidate;
            }
          }
        } catch {
          // Ignorar fallo en anchor point
        }
      }
    }

    if (freeBaseRawRoute) {
      const freeOption = this.enrichRouteOption({
        id: 'route-free',
        rawRoute: freeBaseRawRoute,
        tolls: [],
        type: 'NO_TOLL',
        fuelConsumption,
        fuelPrice,
        timeValue,
        preferenceMode,
      });
      rawCandidates.push(freeOption);
    }

    // =========================================================================
    // ROUTE DISCOVERY (Fase 1: CandidateBranchGenerator + Fase 2: CandidateEvaluator)
    // =========================================================================
    const remainingBudgetForDiscovery = 5 - osrmCallsCount;
    if (remainingBudgetForDiscovery >= 2 && fastRawRoute) {
      try {
        const branchCandidates = this.branchGenerator.generateCandidates(
          fastRawRoute,
          request.origin,
          request.destination
        );

        if (branchCandidates.length > 0) {
          const maxEvaluations = Math.min(2, Math.floor(remainingBudgetForDiscovery / 2));
          const discoveryResult = await this.candidateEvaluator.evaluateCandidatePool(
            fastRawRoute,
            request.origin,
            request.destination,
            branchCandidates,
            routingProvider,
            { maxEvaluations }
          );

          osrmCallsCount += discoveryResult.osrmCallsUsed;

          let discoveryIdx = 1;
          for (const cand of discoveryResult.acceptedRouteCandidates) {
            const discHints = this.extractHighwayHints(cand.rawRoute);
            const discTolls = await this.tollMatcher.matchTollsAlongRoute(
              cand.rawRoute.geometry.coordinates,
              {
                radiusMeters: DEFAULT_CONFIG.tollMatchingRadiusMeters,
                vehicleType,
                highwayHints: discHints,
                avoidTollIds,
              }
            );

            const activeDiscTolls = discTolls.filter(
              (e) => !e.isAvoided && !avoidTollIds.includes(e.tollPlazaId)
            );
            const isNoToll = activeDiscTolls.length === 0;
            const routeType: RouteType = isNoToll ? 'NO_TOLL' : 'HYBRID';

            const discOption = this.enrichRouteOption({
              id: `route-discovery-${discoveryIdx++}`,
              rawRoute: cand.rawRoute,
              tolls: activeDiscTolls,
              type: routeType,
              fuelConsumption,
              fuelPrice,
              timeValue,
              preferenceMode,
            });

            if (cand.divergence.classification === 'REGIONAL_ALTERNATIVE') {
              discOption.title = 'Corredor Regional Alternativo';
            } else if (cand.divergence.classification === 'LOCAL_HYBRID') {
              discOption.title = 'Alternativa Híbrida Descubierta';
            }

            rawCandidates.push(discOption);
          }
        }
      } catch {
        // Resiliencia: fallo en discovery no interrumpe el flujo base
      }
    }

    // =========================================================================
    // RESOLUCIÓN LOCAL DE BYPASSES (100% Local, 0 Llamadas OSRM)
    // =========================================================================
    const resolvedBypasses: ResolvedTollBypass[] = [];
    for (const toll of activeFastTolls) {
      const candidate = await this.tollBypassResolver.resolveBypass(
        toll,
        fastRawRoute,
        freeBaseRawRoute
      );
      if (candidate && candidate.confidence > 0) {
        resolvedBypasses.push({ toll, candidate });
      }
    }

    // =========================================================================
    // SELECCIÓN DE CASETAS CRÍTICAS (Priority = TollPrice × BypassConfidence)
    // =========================================================================
    const criticalSelections = this.criticalTollSelector.selectTopCandidates(resolvedBypasses, 2);
    const validBypasses: { toll: TollEvent; bypass: TollBypassCandidate }[] = [];

    // =========================================================================
    // LLAMADAS 3 y 4: Rutas Híbridas Individuales
    // =========================================================================
    let hybridIndex = 1;
    for (const { toll, candidate } of criticalSelections) {
      if (osrmCallsCount >= 5) break;

      try {
        const hybridRes = await routingProvider.calculateRoute({
          origin: request.origin,
          destination: request.destination,
          waypoints: [candidate.exitPoint, candidate.reentryPoint],
        });
        osrmCallsCount++;

        if (hybridRes.routes.length > 0) {
          const hybridRaw = hybridRes.routes[0];

          // Validación 1: Geometría local pasa cerca de E_out y E_in (<= 200m)
          const passedWaypoints = routePassesThroughWaypoints(
            hybridRaw.geometry.coordinates,
            [candidate.exitPoint, candidate.reentryPoint],
            200
          );
          if (!passedWaypoints) continue;

          // Validación 2: Evasión de la caseta objetivo mediante TollMatcher
          const hybridHints = this.extractHighwayHints(hybridRaw);
          const hybridTolls = await this.tollMatcher.matchTollsAlongRoute(
            hybridRaw.geometry.coordinates,
            {
              radiusMeters: DEFAULT_CONFIG.tollMatchingRadiusMeters,
              vehicleType,
              highwayHints: hybridHints,
              avoidTollIds,
            }
          );

          const targetStillPresent = hybridTolls.some(
            (t) => t.tollPlazaId === toll.tollPlazaId
          );

          if (!targetStillPresent) {
            validBypasses.push({ toll, bypass: candidate });
            const cat = classifyRoute(hybridRaw, hybridTolls, true);
            const hybridOption = this.enrichRouteOption({
              id: `route-hybrid-${hybridIndex++}`,
              rawRoute: hybridRaw,
              tolls: hybridTolls,
              type: cat,
              fuelConsumption,
              fuelPrice,
              timeValue,
              preferenceMode,
            });
            rawCandidates.push(hybridOption);
          }
        }
      } catch {
        // Fallo en cálculo de híbrida individual
      }
    }

    // =========================================================================
    // LLAMADA 5: Ruta Combinada (Validación estricta de secuencialidad)
    // =========================================================================
    if (validBypasses.length === 2 && osrmCallsCount < 5) {
      const [b1, b2] = validBypasses;

      // Validación estricta: exit1 < reentry1 < exit2 < reentry2
      const isStrictlySequential =
        b1.bypass.exitDistanceMeters < b1.bypass.reentryDistanceMeters &&
        b1.bypass.reentryDistanceMeters < b2.bypass.exitDistanceMeters &&
        b2.bypass.exitDistanceMeters < b2.bypass.reentryDistanceMeters;

      if (isStrictlySequential) {
        try {
          const combinedWaypoints = [
            b1.bypass.exitPoint,
            b1.bypass.reentryPoint,
            b2.bypass.exitPoint,
            b2.bypass.reentryPoint,
          ];

          const combinedRes = await routingProvider.calculateRoute({
            origin: request.origin,
            destination: request.destination,
            waypoints: combinedWaypoints,
          });
          osrmCallsCount++;

          if (combinedRes.routes.length > 0) {
            const combinedRaw = combinedRes.routes[0];
            const passedAll = routePassesThroughWaypoints(
              combinedRaw.geometry.coordinates,
              combinedWaypoints,
              200
            );

            if (passedAll) {
              const combinedHints = this.extractHighwayHints(combinedRaw);
              const combinedTolls = await this.tollMatcher.matchTollsAlongRoute(
                combinedRaw.geometry.coordinates,
                {
                  radiusMeters: DEFAULT_CONFIG.tollMatchingRadiusMeters,
                  vehicleType,
                  highwayHints: combinedHints,
                  avoidTollIds,
                }
              );

              const avoidsBoth = !combinedTolls.some(
                (t) =>
                  t.tollPlazaId === b1.toll.tollPlazaId ||
                  t.tollPlazaId === b2.toll.tollPlazaId
              );

              if (avoidsBoth) {
                const cat = classifyRoute(combinedRaw, combinedTolls, true);
                const combinedOption = this.enrichRouteOption({
                  id: 'route-hybrid-combined',
                  rawRoute: combinedRaw,
                  tolls: combinedTolls,
                  type: cat,
                  fuelConsumption,
                  fuelPrice,
                  timeValue,
                  preferenceMode,
                });
                rawCandidates.push(combinedOption);
              }
            }
          }
        } catch {
          // Fallo en cálculo de combinada
        }
      }
    }

    // =========================================================================
    // FILTRO PARETO DE REFERENCIA (vs FAST) Y GUARDRAIL DE EFICIENCIA
    // =========================================================================
    const acceptedRoutes: RouteOption[] = [];
    const baseDirectCost = fastOption.totalCost;
    const baseDuration = fastOption.durationSeconds;

    for (const candidate of rawCandidates) {
      if (candidate.id === fastOption.id) {
        acceptedRoutes.push(candidate);
        continue;
      }

      const deltaMoney = baseDirectCost - candidate.totalCost;
      const deltaMinutes = (candidate.durationSeconds - baseDuration) / 60;

      // Regla 1: Más barata y más rápida (domina a FAST)
      if (deltaMoney > 0 && deltaMinutes <= 0) {
        acceptedRoutes.push(candidate);
        continue;
      }

      // Regla 2: Más cara y más lenta (dominada por FAST)
      if (deltaMoney <= 0 && deltaMinutes > 0) {
        continue; // Descartar
      }

      // Regla 3: Más cara y más rápida (trade-off de velocidad)
      if (deltaMoney <= 0 && deltaMinutes <= 0) {
        acceptedRoutes.push(candidate);
        continue;
      }

      // Regla 4: Más barata y más lenta -> Aplicar Guardrail
      if (deltaMoney > 0 && deltaMinutes > 0) {
        const efficiency = deltaMinutes / (deltaMoney / 100);
        if (efficiency <= 45) {
          // MAX_ADDITIONAL_MINUTES_PER_100_MXN
          acceptedRoutes.push(candidate);
        }
      }
    }

    const uniqueRoutes = this.deduplicateRoutes(acceptedRoutes);
    uniqueRoutes.sort((a, b) => a.score - b.score);

    const bestRoute = uniqueRoutes[0] || fastOption;
    const cheapestRoute = [...uniqueRoutes].sort((a, b) => a.totalCost - b.totalCost)[0] || bestRoute;
    const fastestRoute = [...uniqueRoutes].sort((a, b) => a.durationSeconds - b.durationSeconds)[0] || bestRoute;

    for (const route of uniqueRoutes) {
      const isRecommended = route.id === bestRoute.id;
      const timeSavedVsCheapest = Math.round((cheapestRoute.durationSeconds - route.durationSeconds) / 60);
      const costDiffVsCheapest = Math.round((route.totalCost - cheapestRoute.totalCost) * 100) / 100;
      const costPerMinuteSaved =
        timeSavedVsCheapest > 0 && costDiffVsCheapest > 0
          ? Math.round((costDiffVsCheapest / timeSavedVsCheapest) * 100) / 100
          : undefined;

      const timeAddedVsFastest = Math.round((route.durationSeconds - fastestRoute.durationSeconds) / 60);
      const moneySavedVsFastest = Math.round((fastestRoute.totalCost - route.totalCost) * 100) / 100;

      route.comparison = {
        vsCheapest: {
          extraMoney: Math.max(0, costDiffVsCheapest),
          minutesSaved: Math.max(0, timeSavedVsCheapest),
          costPerMinuteSaved,
        },
        vsFastest: {
          moneySaved: Math.max(0, moneySavedVsFastest),
          minutesAdded: Math.max(0, timeAddedVsFastest),
        },
      };

      route.explanation = this.generateExplanation(
        route,
        isRecommended,
        fastestRoute,
        cheapestRoute,
        costPerMinuteSaved
      );
    }

    const searchId = `search-${Date.now()}`;
    this.persistSearch(searchId, request, uniqueRoutes).catch(() => {});

    return {
      searchId,
      origin: request.origin,
      destination: request.destination,
      recommendedRouteId: bestRoute?.id || uniqueRoutes[0]?.id || 'route-fast',
      routes: uniqueRoutes,
      calculatedAt: new Date().toISOString(),
    };
  }

  private extractHighwayHints(rawRoute: RawRouteOption): string[] {
    const hints: string[] = [];
    for (const leg of rawRoute.legs || []) {
      for (const step of leg.steps || []) {
        if (step.name) hints.push(step.name);
      }
    }
    return Array.from(new Set(hints.filter(Boolean)));
  }

  private enrichRouteOption(params: {
    id: string;
    rawRoute: RawRouteOption;
    tolls: TollEvent[];
    type: RouteType;
    fuelConsumption: number;
    fuelPrice: number;
    timeValue: number;
    preferenceMode: 'MONEY' | 'TIME' | 'BALANCED';
  }): RouteOption {
    const { id, rawRoute, tolls, type, fuelConsumption, fuelPrice, timeValue, preferenceMode } = params;

    const tollSummary = this.tollCostService.calculateSummary(tolls);
    const tollCost = tollSummary.totalCashCost;

    const fuelResult = this.fuelCostService.calculate(
      rawRoute.distanceMeters,
      fuelConsumption,
      fuelPrice
    );
    const fuelCost = fuelResult.fuelCost;

    const timeResult = this.timeCostService.calculate(
      rawRoute.durationSeconds,
      timeValue
    );
    const timeCost = timeResult.timeCost;

    const directCost = Math.round((fuelCost + tollCost) * 100) / 100;
    const generalizedCost = Math.round((directCost + timeCost) * 100) / 100;

    const cost: CostBreakdown = {
      fuel: fuelCost,
      tolls: tollCost,
      direct: directCost,
      time: timeCost,
      generalized: generalizedCost,
      hasUnknownTolls: tollSummary.hasUnknownPrices,
      hasOutdatedTolls: tollSummary.hasOutdatedPrices,
    };

    // Scoring Limpio sin doble contabilización
    let score = generalizedCost;
    if (preferenceMode === 'MONEY') {
      score = directCost;
    } else if (preferenceMode === 'TIME') {
      score = rawRoute.durationSeconds;
    } else {
      score = generalizedCost;
    }

    const segments: RouteSegment[] = [];
    let segSeq = 1;

    for (const leg of rawRoute.legs || []) {
      for (const step of leg.steps || []) {
        segments.push({
          id: `${id}-seg-${segSeq}`,
          sequence: segSeq++,
          type: step.isToll ? 'TOLL' : 'FREE',
          name: step.name || (step.isToll ? 'Autopista de Cuota' : 'Carretera Libre'),
          distanceMeters: step.distanceMeters,
          durationSeconds: step.durationSeconds,
          tollCost: step.isToll ? Math.round(tollCost / Math.max(1, tolls.length)) : 0,
          geometry: JSON.stringify(step.geometry),
        });
      }
    }

    if (segments.length === 0) {
      segments.push({
        id: `${id}-seg-1`,
        sequence: 1,
        type: tollCost > 0 ? 'TOLL' : 'FREE',
        name: 'Trayecto Principal',
        distanceMeters: rawRoute.distanceMeters,
        durationSeconds: rawRoute.durationSeconds,
        tollCost,
        geometry: JSON.stringify(rawRoute.geometry.coordinates),
      });
    }

    return {
      id,
      type,
      title: this.getRouteTitle(type),
      distanceMeters: rawRoute.distanceMeters,
      durationSeconds: rawRoute.durationSeconds,
      cost,
      tollCost,
      fuelCost,
      totalCost: directCost,
      score: Math.round(score * 100) / 100,
      geometry: JSON.stringify(rawRoute.geometry),
      tolls,
      tollPlazas: tolls.map((e) => ({
        id: e.tollPlazaId,
        name: e.name,
        highway: e.highway,
        road: e.road,
        price: e.price,
        latitude: e.latitude,
        longitude: e.longitude,
        distanceToRouteMeters: e.distanceToRouteMeters,
        confidence: e.confidence ?? 'HIGH',
        matchStatus: e.matchStatus ?? 'MATCHED',
      })),
      segments,
      costBreakdown: cost,
      explanation: {
        headline: '',
        description: '',
        badge: '',
        isRecommended: false,
      },
    };
  }

  private getRouteTitle(type: RouteType): string {
    switch (type) {
      case 'FAST':
        return 'Ruta Rápida (Autopista)';
      case 'CHEAP':
        return 'Ruta Económica';
      case 'BALANCED':
        return 'Ruta Balanceada';
      case 'NO_TOLL':
        return 'Carretera Libre (Sin Casetas)';
      case 'HYBRID':
        return 'Ruta Híbrida Inteligente';
      default:
        return 'Ruta Alternativa';
    }
  }

  private generateExplanation(
    route: RouteOption,
    isRecommended: boolean,
    fastest: RouteOption,
    cheapest: RouteOption,
    costPerMinSaved?: number
  ): RouteExplanation {
    const hasUnknown = route.cost.hasUnknownTolls;
    const hasOutdated = route.cost.hasOutdatedTolls;

    let noticeSuffix = '';
    if (hasUnknown) {
      noticeSuffix = ' ⚠️ Incluye caseta con tarifa no verificada.';
    } else if (hasOutdated) {
      noticeSuffix = ' ℹ️ Incluye caseta con tarifa estimada sujeta a actualización.';
    }

    if (isRecommended) {
      if (route.id === cheapest.id && route.id === fastest.id) {
        return {
          headline: 'Opción Ideal',
          description: `Esta ruta es tanto la más rápida como la más económica para tu trayecto.${noticeSuffix}`,
          badge: '🏆 Mejor Opción',
          isRecommended: true,
        };
      }
      if (route.id === cheapest.id) {
        return {
          headline: 'Máximo Ahorro',
          description: `Ahorras al 100% en casetas manteniendo un tiempo de traslado competitivo.${noticeSuffix}`,
          badge: '💰 Más Económica',
          isRecommended: true,
        };
      }
      if (route.type === 'HYBRID') {
        return {
          headline: 'Mejor Balance Inteligente',
          description: `Combinación inteligente de cuota y libre. Ahorras dinero evadiendo casetas caras con mínima penalización de tiempo.${noticeSuffix}`,
          badge: '🧠 Híbrida Inteligente',
          isRecommended: true,
        };
      }
      return {
        headline: 'Mejor Balance Tiempo/Dinero',
        description: costPerMinSaved
          ? `Pagas $${route.tollCost} en casetas ahorrando ${route.comparison?.vsCheapest?.minutesSaved ?? 0} min ($${costPerMinSaved}/min ahorrado).${noticeSuffix}`
          : `Excelente relación entre tiempo invertido y costo total de combustible y casetas.${noticeSuffix}`,
        badge: '⚖️ Recomendada',
        isRecommended: true,
      };
    }

    if (route.id === fastest.id) {
      const timeDiff = Math.round((cheapest.durationSeconds - route.durationSeconds) / 60);
      return {
        headline: 'Llegada Más Rápida',
        description: `Llegas ${timeDiff} minutos antes usando autopista de cuota completa.${noticeSuffix}`,
        badge: '⚡ Más Rápida',
        isRecommended: false,
      };
    }

    if (route.id === cheapest.id) {
      return {
        headline: 'Cero Casetas',
        description: `Recorrido 100% por carretera libre.${noticeSuffix}`,
        badge: '💰 Cero Casetas',
        isRecommended: false,
      };
    }

    if (route.id.startsWith('route-discovery')) {
      const isRegional = route.title.includes('Regional');
      return {
        headline: isRegional ? 'Alternativa Regional Descubierta' : 'Alternativa Híbrida Descubierta',
        description: isRegional
          ? `Ruta alternativa descubierta por corredor vial independiente.${noticeSuffix}`
          : `Ruta alternativa descubierta con desvío intermedio.${noticeSuffix}`,
        badge: isRegional ? '🗺️ Corredor Regional' : '🔄 Alternativa Híbrida',
        isRecommended: false,
      };
    }

    if (route.type === 'HYBRID') {
      return {
        headline: 'Alternativa Híbrida',
        description: `Evade casetas intermedias mediante desvíos por vías libres conectadas.${noticeSuffix}`,
        badge: '🔄 Alternativa Híbrida',
        isRecommended: false,
      };
    }

    return {
      headline: 'Alternativa de Ruta',
      description: `Opción alternativa de recorrido.${noticeSuffix}`,
      badge: '🔄 Alternativa',
      isRecommended: false,
    };
  }

  private deduplicateRoutes(routes: RouteOption[]): RouteOption[] {
    const seen = new Set<string>();
    const result: RouteOption[] = [];

    for (const r of routes) {
      const distBucket = Math.round(r.distanceMeters / 2000);
      const durBucket = Math.round(r.durationSeconds / 300);
      const costBucket = Math.round(r.totalCost / 20);
      const key = `${distBucket}-${durBucket}-${costBucket}-${r.tollCost}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }

    return result.length > 0 ? result : routes;
  }

  private async persistSearch(searchId: string, req: RouteCalculationRequest, routes: RouteOption[]) {
    try {
      const db = getDb();
      await db.insert(routeSearches).values({
        originLat: req.origin.latitude,
        originLon: req.origin.longitude,
        originLabel: req.origin.label,
        destinationLat: req.destination.latitude,
        destinationLon: req.destination.longitude,
        destinationLabel: req.destination.label,
        fuelPrice: req.vehicle?.fuelPrice ?? DEFAULT_CONFIG.defaultFuelPrice,
        fuelConsumption: req.vehicle?.fuelConsumption ?? DEFAULT_CONFIG.defaultFuelConsumption,
        timeValue: req.preferences?.timeValue ?? DEFAULT_CONFIG.defaultTimeValue,
        preference: req.preferences?.mode ?? 'BALANCED',
        avoidTolls: req.avoidTollPlazaIds || [],
      });
    } catch {
      // Telemetría no bloqueante
    }
  }
}
