import { FastifyInstance } from 'fastify';
import { listTollsHandler, getTollByIdHandler } from './tolls.controller';

export async function tollsRoutes(fastify: FastifyInstance) {
  fastify.get('/tolls', listTollsHandler);
  fastify.get('/tolls/:id', getTollByIdHandler);
}
