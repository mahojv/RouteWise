import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@routewise/routing': path.resolve(__dirname, '../../packages/routing/src/index.ts'),
      '@routewise/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@routewise/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@routewise/validation': path.resolve(__dirname, '../../packages/validation/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      ROUTING_PROVIDER: 'mock',
      GEOCODING_PROVIDER: 'mock',
      PORT: '3000',
    },
  },
});

