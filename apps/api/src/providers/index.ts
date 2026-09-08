import { createRoutingProvider, RoutingProvider } from '@routewise/routing';
import { env } from '../config/env';

export function getRoutingProvider(): RoutingProvider {
  const providerName = process.env.ROUTING_PROVIDER || env.ROUTING_PROVIDER;
  return createRoutingProvider({
    provider: providerName,
    osrm: {
      baseUrl: process.env.OSRM_URL || env.OSRM_URL,
    },
    ors: {
      baseUrl: process.env.ORS_URL || env.ORS_URL,
      apiKey: process.env.ORS_API_KEY || env.ORS_API_KEY,
    },
  });
}
