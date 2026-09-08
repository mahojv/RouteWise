import { FastifyInstance } from 'fastify';
import { listVehiclesHandler } from './vehicles.controller';

export async function vehiclesRoutes(fastify: FastifyInstance) {
  fastify.get('/vehicles', listVehiclesHandler);
}
