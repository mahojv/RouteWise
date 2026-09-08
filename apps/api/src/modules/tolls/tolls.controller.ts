import { FastifyReply, FastifyRequest } from 'fastify';
import { TollsService } from './tolls.service';
import { tollQueryFilterSchema } from '@routewise/validation';

const tollsService = new TollsService();

export async function listTollsHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = tollQueryFilterSchema.safeParse(request.query);
  const filter = parsed.success ? parsed.data : {};
  const result = await tollsService.listTolls(filter as any);
  return reply.send({ tolls: result });
}

export async function getTollByIdHandler(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { vehicleType?: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const vehicleType = request.query.vehicleType as any;
  const toll = await tollsService.getTollById(id, vehicleType);

  if (!toll) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Caseta con ID ${id} no encontrada.`,
    });
  }

  return reply.send({ toll });
}
