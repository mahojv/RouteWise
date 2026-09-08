import { FastifyInstance } from 'fastify';
import { getHealthHandler } from './health.controller';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', getHealthHandler);
}
