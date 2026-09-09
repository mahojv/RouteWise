export * from './types';
export * from './providers/routing-provider.interface';
export * from './providers/osrm.provider';
export * from './providers/ors.provider';
export * from './providers/mock.provider';
export * from './candidate-branch-generator';
export * from './candidate-evaluator';
export * from './fixtures/queretaro-cdmx';
export * from './fixtures/queretaro-sanluis';

import { RoutingProvider } from './providers/routing-provider.interface';
import { OSRMProvider, OSRMProviderConfig } from './providers/osrm.provider';
import { ORSProvider, ORSProviderConfig } from './providers/ors.provider';
import { MockRoutingProvider } from './providers/mock.provider';

export type ProviderType = 'osrm' | 'ors' | 'openrouteservice' | 'mock';

export interface ProviderFactoryConfig {
  provider: ProviderType | string;
  osrm?: OSRMProviderConfig;
  ors?: ORSProviderConfig;
}

export function createRoutingProvider(config: ProviderFactoryConfig): RoutingProvider {
  switch (config.provider.toLowerCase()) {
    case 'osrm':
      return new OSRMProvider(config.osrm);
    case 'ors':
    case 'openrouteservice':
      return new ORSProvider(config.ors);
    case 'mock':
    default:
      return new MockRoutingProvider();
  }
}
