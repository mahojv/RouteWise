import { defineConfig } from 'vitest/config';

export default defineConfig({
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
