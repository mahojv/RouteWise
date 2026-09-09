import { FastifyInstance } from 'fastify';
import { calculateRouteHandler, searchRouteHandler } from './routing.controller';

export async function routingRoutes(fastify: FastifyInstance) {
  fastify.post('/routes/search', searchRouteHandler);
  fastify.post('/routes/calculate', calculateRouteHandler);
}
