import {
  RouteSearchRequest,
  RouteCalculationRequest,
  RouteCalculationResponse,
  RouteSearchResponse,
  GeoJSONGeometry,
  PublicRouteOption,
} from '@routewise/types';

/**
 * Maps public RouteSearchRequest to internal RouteCalculationRequest expected by RouteOptimizationService
 * Does NOT alter internal service behavior.
 */
export function mapSearchRequestToCalculationRequest(
  searchReq: RouteSearchRequest
): RouteCalculationRequest {
  return {
    origin: {
      latitude: searchReq.origin.latitude,
      longitude: searchReq.origin.longitude,
      label: searchReq.origin.label,
    },
    destination: {
      latitude: searchReq.destination.latitude,
      longitude: searchReq.destination.longitude,
      label: searchReq.destination.label,
    },
    vehicle: {
      vehicleType: searchReq.vehicle?.type,
      fuelConsumption: searchReq.vehicle?.fuelEfficiencyKmPerLiter,
      fuelPrice: searchReq.vehicle?.fuelPricePerLiter,
    },
    preferences: {
      mode: searchReq.preferences?.strategy,
      timeValue: searchReq.preferences?.timeValue,
    },
  };
}

/**
 * Maps internal RouteCalculationResponse to clean public RouteSearchResponse for Mobile client
 * - Parses geometry string into actual GeoJSON object
 * - Sanitizes toll plaza objects to eliminate internal OSRM/DB leak
 * - Formats distance in Km and duration in minutes
 */
export function mapCalculationResponseToSearchResponse(
  calcRes: RouteCalculationResponse
): RouteSearchResponse {
  return {
    searchId: calcRes.searchId,
    origin: calcRes.origin,
    destination: calcRes.destination,
    recommendedRouteId: calcRes.recommendedRouteId,
    routes: calcRes.routes.map((r): PublicRouteOption => {
      let parsedGeom: GeoJSONGeometry;
      if (typeof r.geometry === 'string') {
        try {
          parsedGeom = JSON.parse(r.geometry);
        } catch {
          parsedGeom = { type: 'LineString', coordinates: [] };
        }
      } else {
        parsedGeom = r.geometry as GeoJSONGeometry;
      }

      return {
        id: r.id,
        type: r.type,
        title: r.title,
        distanceKm: Math.round((r.distanceMeters / 1000) * 100) / 100,
        durationMinutes: Math.round((r.durationSeconds / 60) * 10) / 10,
        cost: r.cost,
        geometry: parsedGeom,
        tolls: (r.tolls || []).map((t) => ({
          id: t.tollPlazaId || t.id,
          name: t.name,
          price: t.price,
          latitude: t.latitude,
          longitude: t.longitude,
        })),
        comparison: r.comparison,
        explanation: r.explanation,
      };
    }),
    calculatedAt: calcRes.calculatedAt,
  };
}
