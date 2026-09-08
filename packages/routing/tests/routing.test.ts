import { describe, it, expect } from 'vitest';
import { createRoutingProvider } from '../src';

describe('Routing Provider Abstraction', () => {
  it('instantiates the Mock provider properly', async () => {
    const provider = createRoutingProvider({ provider: 'mock' });
    expect(provider.name).toBe('mock');

    const health = await provider.checkHealth();
    expect(health.status).toBe('ok');
  });

  it('calculates routes using mock provider with fixtures', async () => {
    const provider = createRoutingProvider({ provider: 'mock' });

    const response = await provider.calculateRoute({
      origin: { latitude: 20.5888, longitude: -100.3899, label: 'Querétaro' },
      destination: { latitude: 19.4326, longitude: -99.1332, label: 'CDMX' },
    });

    expect(response.provider).toBe('mock');
    expect(response.routes.length).toBeGreaterThanOrEqual(1);

    const firstRoute = response.routes[0];
    expect(firstRoute.distanceMeters).toBeGreaterThan(0);
    expect(firstRoute.durationSeconds).toBeGreaterThan(0);
    expect(firstRoute.legs.length).toBeGreaterThan(0);
  });

  it('instantiates OSRM provider with configured URL', () => {
    const provider = createRoutingProvider({
      provider: 'osrm',
      osrm: { baseUrl: 'http://custom-osrm:5000' },
    });
    expect(provider.name).toBe('osrm');
  });
});
