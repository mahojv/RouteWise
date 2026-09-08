import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { env } from './config/env';
import { healthRoutes } from './modules/health/health.routes';
import { routingRoutes } from './modules/routing/routing.routes';
import { vehiclesRoutes } from './modules/vehicles/vehicles.routes';
import { tollsRoutes } from './modules/tolls/tolls.routes';
import { geocodingRoutes } from './modules/geocoding/geocoding.routes';

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(sensible);

  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });

  // Root Health check
  await fastify.register(healthRoutes);

  // API v1 Routes
  await fastify.register(
    async (v1) => {
      await v1.register(healthRoutes);
      await v1.register(routingRoutes);
      await v1.register(vehiclesRoutes);
      await v1.register(tollsRoutes);
      await v1.register(geocodingRoutes);
    },
    { prefix: '/api/v1' }
  );

  return fastify;
}
