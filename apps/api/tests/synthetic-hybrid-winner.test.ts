import { describe, it, expect } from 'vitest';
import { RouteOptimizationService } from '../src/modules/routing/route-optimizer.service';
import { RoutingProvider, RoutingRequest, RoutingResponse, RawRouteOption } from '@routewise/routing';
import { TollMatcherService } from '../src/modules/tolls/toll-matcher.service';
import { TollCostService } from '../src/modules/tolls/toll-cost.service';
import { FuelCostService } from '../src/modules/routing/services/fuel-cost.service';
import { TimeCostService } from '../src/modules/routing/services/time-cost.service';
import { TollBypassResolverService } from '../src/modules/tolls/toll-bypass-resolver.service';
import { CriticalTollSelectorService } from '../src/modules/routing/services/critical-toll-selector.service';
import { FreeCorridorAnchorService } from '../src/modules/routing/services/free-corridor-anchor.service';

/**
 * Mock Routing Provider determinista con valores calibrados de tiempo y distancia
 */
class SyntheticWinnerMockProvider implements RoutingProvider {
  public readonly name = 'synthetic-mock';
  public callCount = 0;

  // Calibración de combustible para 14.5 km/L a $24.50/L:
  // Para que el costo directo de FAST sea $400 ($108 toll + fuel $292 => ~173 km)
  // Para que el costo directo de FREE sea $0 toll + fuel $0 (simplificado o calibrado)
  public async calculateRoute(request: RoutingRequest): Promise<RoutingResponse> {
    this.callCount++;

    const isHybridCall = request.waypoints && request.waypoints.length === 2 && request.waypoints[1].latitude === 20.2450;
    const isFreeCall = request.waypoints && request.waypoints.length >= 1 && !isHybridCall;

    if (isHybridCall) {
      // HYBRID: 130 min (7800s), Toll $0 (evade la de $108 y no cruza peaje)
      // Combustible directo calibrado para total directo de $120
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 71000,
            durationSeconds: 130 * 60, // 130 min = 7800s
            geometry: {
              type: 'LineString',
              coordinates: [
                [-99.6521, 20.3742], // Pasa por E_out
                [-99.5850, 20.2450], // Pasa por E_in
                [-99.1332, 19.4326],
              ],
            },
            legs: [
              {
                distanceMeters: 71000,
                durationSeconds: 130 * 60,
                steps: [
                  { name: 'Tramo Libre Bypass', distanceMeters: 20000, durationSeconds: 2000, mode: 'driving', geometry: [] },
                  { name: 'Autopista Cuota Tramo 2', distanceMeters: 51000, durationSeconds: 5800, mode: 'driving', geometry: [] }
                ]
              }
            ]
          }
        ]
      };
    }

    if (isFreeCall) {
      // FREE: 210 min (12600s), Toll $0, combustible mínimo directo
      return {
        provider: this.name,
        latencyMs: 5,
        routes: [
          {
            distanceMeters: 0,
            durationSeconds: 210 * 60, // 210 min = 12600s
            geometry: {
              type: 'LineString',
              coordinates: [
                [-99.6521, 20.3742],
                [-99.1332, 19.4326],
              ],
            },
            legs: [
              {
                distanceMeters: 0,
                durationSeconds: 210 * 60,
                steps: [{ name: 'Carretera Libre 100%', distanceMeters: 0, durationSeconds: 210 * 60, mode: 'driving', geometry: [] }]
              }
            ]
          }
        ]
      };
    }

    // FAST (Base): 120 min (7200s), Toll $108 (Palmillas)
    return {
      provider: this.name,
      latencyMs: 5,
      routes: [
        {
          distanceMeters: 172800, // Produce fuel de ~$292 + $108 toll = $400 directo
          durationSeconds: 120 * 60, // 120 min = 7200s
          geometry: {
            type: 'LineString',
            coordinates: [
              [-100.3899, 20.5888],
              [-99.9349, 20.3069], // Pasa por Palmillas
              [-99.1332, 19.4326],
            ],
          },
          legs: [
            {
              distanceMeters: 172800,
              durationSeconds: 120 * 60,
              steps: [
                { name: 'Carretera México - Querétaro (Cuota)', distanceMeters: 172800, durationSeconds: 7200, mode: 'driving', isToll: true, geometry: [] }
              ]
            }
          ]
        }
      ]
    };
  }

  public async checkHealth() {
    return { status: 'ok' as const, latencyMs: 1 };
  }
}

import { FIXTURE_CURATED_BYPASSES } from '../src/fixtures/bypasses.fixture';

describe('Synthetic Hybrid Winner Deterministic Test (Phase 3 MVP)', () => {
  it('Evaluates MONEY -> FREE, TIME -> FAST, and BALANCED -> HYBRID without time double-counting', async () => {
    const mockProvider = new SyntheticWinnerMockProvider();
    const service = new RouteOptimizationService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new TollBypassResolverService(FIXTURE_CURATED_BYPASSES),
      undefined,
      undefined,
      mockProvider
    );

    const baseRequest = {
      origin: { latitude: 20.5888, longitude: -100.3899, label: 'Querétaro' },
      destination: { latitude: 19.4326, longitude: -99.1332, label: 'CDMX' },
      vehicle: {
        fuelConsumption: 14.5,
        fuelPrice: 24.50,
        vehicleType: 'automovil' as const,
      },
      preferences: {
        timeValue: 120, // $120 MXN/h
      },
    };

    // 1. Prueba con preferencia MONEY
    const moneyRes = await service.optimizeRoute({
      ...baseRequest,
      preferences: { mode: 'MONEY', timeValue: 120 },
    });
    expect(moneyRes.routes.length).toBeGreaterThanOrEqual(2);
    const moneyWinner = moneyRes.routes.find((r) => r.id === moneyRes.recommendedRouteId);
    expect(moneyWinner?.type).toBe('NO_TOLL'); // Ganador MONEY es la ruta libre con menor costo directo ($0 vs $120 vs $400)

    // 2. Prueba con preferencia TIME
    const timeRes = await service.optimizeRoute({
      ...baseRequest,
      preferences: { mode: 'TIME', timeValue: 120 },
    });
    const timeWinner = timeRes.routes.find((r) => r.id === timeRes.recommendedRouteId);
    expect(timeWinner?.type).toBe('FAST'); // Ganador TIME es FAST con 120 min (vs 130 min vs 210 min)

    // 3. Prueba con preferencia BALANCED
    const balancedRes = await service.optimizeRoute({
      ...baseRequest,
      preferences: { mode: 'BALANCED', timeValue: 120 },
    });
    const balancedWinner = balancedRes.routes.find((r) => r.id === balancedRes.recommendedRouteId);
    expect(balancedWinner?.type).toBe('HYBRID'); // Ganador BALANCED es HYBRID ($380 vs $420 vs $640)
  });
});
