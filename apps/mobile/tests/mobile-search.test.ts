import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchRoutes, RouteApiError, getApiBaseUrl } from '../src/services/api-client';
import { searchLocations } from '../src/services/geocodingService';
import { useRouteStore } from '../src/store/routeStore';
import { RouteSearchRequest, RouteSearchResponse } from '@routewise/types';

const mockResponseSuccess: RouteSearchResponse = {
  searchId: 'test-search-123',
  origin: { latitude: 20.5888, longitude: -100.3899, label: 'Querétaro' },
  destination: { latitude: 19.4326, longitude: -99.1332, label: 'CDMX' },
  recommendedRouteId: 'route-fast-1',
  calculatedAt: new Date().toISOString(),
  routes: [
    {
      id: 'route-fast-1',
      type: 'FAST',
      title: 'Ruta Cuota (Más Rápida)',
      distanceKm: 212.5,
      durationMinutes: 168.0,
      cost: {
        fuel: 358.90,
        tolls: 380.00,
        time: 336.00,
        direct: 738.90,
        generalized: 1074.90,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.3899, 20.5888],
          [-99.1332, 19.4326],
        ],
      },
      tolls: [
        {
          id: 'toll-palmillas',
          name: 'Caseta Palmillas',
          price: 204.0,
          latitude: 20.352,
          longitude: -99.967,
        },
        {
          id: 'toll-tepotzotlan',
          name: 'Caseta Tepotzotlán',
          price: 176.0,
          latitude: 19.712,
          longitude: -99.223,
        },
      ],
      explanation: {
        badge: '🏆 Opción Recomendada',
        description: 'Ruta más rápida con autopista de cuota.',
      },
    },
    {
      id: 'route-free-2',
      type: 'FREE',
      title: 'Ruta Libre (Sin Casetas)',
      distanceKm: 245.0,
      durationMinutes: 246.0,
      cost: {
        fuel: 413.80,
        tolls: 0.0,
        time: 492.00,
        direct: 413.80,
        generalized: 905.80,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-100.3899, 20.5888],
          [-99.5000, 20.1000],
          [-99.1332, 19.4326],
        ],
      },
      tolls: [],
      explanation: {
        badge: '💰 Más Económica',
        description: 'Ruta 100% libre de casetas.',
      },
    },
  ],
};

describe('Phase 4B - Mobile Route Search API Client & Store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useRouteStore.getState().reset();
  });

  it('should correctly format getApiBaseUrl', () => {
    const url = getApiBaseUrl();
    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
  });

  it('should successfully execute searchRoutes API call (200 OK)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponseSuccess,
    } as Response);

    const reqPayload: RouteSearchRequest = {
      origin: { latitude: 20.5888, longitude: -100.3899 },
      destination: { latitude: 19.4326, longitude: -99.1332 },
      vehicle: {
        type: 'automovil',
        fuelType: 'gasolina_regular',
        fuelEfficiencyKmPerLiter: 14.5,
        fuelPricePerLiter: 24.50,
      },
      preferences: {
        strategy: 'BALANCED',
        timeValue: 120,
      },
    };

    const res = await searchRoutes(reqPayload, 'http://localhost:3000');
    expect(res.searchId).toBe('test-search-123');
    expect(res.routes.length).toBe(2);
    expect(res.routes[0].geometry.type).toBe('LineString');
    expect(res.routes[0].tolls.length).toBe(2);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/routes/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('should throw RouteApiError(400) on bad request parameters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request', message: 'Invalid coords' }),
    } as Response);

    const reqPayload: RouteSearchRequest = {
      origin: { latitude: 999, longitude: -100.3899 }, // invalid lat
      destination: { latitude: 19.4326, longitude: -99.1332 },
    };

    try {
      await searchRoutes(reqPayload, 'http://localhost:3000');
      expect.fail('Should have thrown RouteApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RouteApiError);
      expect(err.statusCode).toBe(400);
      expect(err.errorType).toBe('BAD_REQUEST');
    }
  });

  it('should throw RouteApiError(503) when routing service is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service Unavailable' }),
    } as Response);

    try {
      await searchRoutes(
        {
          origin: { latitude: 20.5888, longitude: -100.3899 },
          destination: { latitude: 19.4326, longitude: -99.1332 },
        },
        'http://localhost:3000'
      );
      expect.fail('Should have thrown RouteApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RouteApiError);
      expect(err.statusCode).toBe(503);
      expect(err.errorType).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('should throw RouteApiError(500) on internal server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    } as Response);

    try {
      await searchRoutes(
        {
          origin: { latitude: 20.5888, longitude: -100.3899 },
          destination: { latitude: 19.4326, longitude: -99.1332 },
        },
        'http://localhost:3000'
      );
      expect.fail('Should have thrown RouteApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RouteApiError);
      expect(err.statusCode).toBe(500);
      expect(err.errorType).toBe('INTERNAL_ERROR');
    }
  });

  it('should throw RouteApiError(NETWORK_ERROR) on connection failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));

    try {
      await searchRoutes(
        {
          origin: { latitude: 20.5888, longitude: -100.3899 },
          destination: { latitude: 19.4326, longitude: -99.1332 },
        },
        'http://localhost:3000'
      );
      expect.fail('Should have thrown RouteApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RouteApiError);
      expect(err.statusCode).toBe(0);
      expect(err.errorType).toBe('NETWORK_ERROR');
    }
  });

  it('should manage routeStore state correctly during search lifecycle', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponseSuccess,
    } as Response);

    const store = useRouteStore.getState();
    expect(store.status).toBe('idle');
    expect(store.searchResult).toBeNull();

    const promise = store.executeSearch('http://localhost:3000');
    expect(useRouteStore.getState().status).toBe('loading');

    await promise;

    const updatedStore = useRouteStore.getState();
    expect(updatedStore.status).toBe('success');
    expect(updatedStore.searchResult).not.toBeNull();
    expect(updatedStore.selectedRouteId).toBe('route-fast-1');
    expect(updatedStore.searchResult?.routes.length).toBe(2);
  });
});

describe('Mobile Geocoding Service (Backend RouteWise Proxy)', () => {
  it('calls RouteWise API geocoding endpoint without exposing direct INEGI keys', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: 'inegi-123',
            displayName: 'Santiago de Querétaro, Querétaro',
            latitude: 20.5888,
            longitude: -100.3899,
            type: 'city',
            importance: 0.95,
            address: { city: 'Querétaro', state: 'Querétaro', country: 'México' },
          },
        ],
      }),
    } as Response);

    const locations = await searchLocations('Querétaro', 'http://localhost:3000');
    expect(locations.length).toBe(1);
    expect(locations[0].name).toBe('Santiago de Querétaro');
    expect(locations[0].latitude).toBe(20.5888);
    expect(locations[0].longitude).toBe(-100.3899);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/geocoding/search?q=Quer%C3%A9taro',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
