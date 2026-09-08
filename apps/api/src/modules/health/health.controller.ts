import { FastifyReply, FastifyRequest } from 'fastify';
import { checkDatabaseHealth } from '../../database';
import { getRoutingProvider } from '../../providers';
import { env } from '../../config/env';
import { HealthStatus } from '@routewise/types';

const startTime = Date.now();

export async function getHealthHandler(request: FastifyRequest, reply: FastifyReply) {
  const dbHealth = await checkDatabaseHealth();
  const routingProvider = getRoutingProvider();
  const routingHealth = await routingProvider.checkHealth();

  const isDegraded = dbHealth.status === 'disconnected' || routingHealth.status !== 'ok';

  const healthResponse: HealthStatus = {
    status: isDegraded ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    version: '0.1.0',
    environment: env.NODE_ENV,
    services: {
      database: dbHealth,
      routing: {
        provider: routingProvider.name,
        status: routingHealth.status,
        latencyMs: routingHealth.latencyMs,
      },
      geocoding: {
        provider: env.GEOCODING_PROVIDER,
        status: 'ok',
      },
    },
  };

  return reply.code(200).send(healthResponse);
}
