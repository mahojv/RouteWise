import { FastifyInstance } from 'fastify';
import { calculateRouteHandler } from './routing.controller';

export async function routingRoutes(fastify: FastifyInstance) {
  fastify.post('/routes/calculate', calculateRouteHandler);
}
