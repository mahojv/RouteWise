import { FastifyReply, FastifyRequest } from 'fastify';
import { VehiclesService } from './vehicles.service';

const vehiclesService = new VehiclesService();

export async function listVehiclesHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await vehiclesService.listVehicles();
  return reply.send({ vehicles: result });
}
