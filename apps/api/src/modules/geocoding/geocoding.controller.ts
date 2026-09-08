import { FastifyReply, FastifyRequest } from 'fastify';
import { GeocodingService } from './geocoding.service';
import { geocodingQuerySchema } from '@routewise/validation';

const geocodingService = new GeocodingService();

export async function searchGeocodingHandler(request: FastifyRequest, reply: FastifyReply) {
  const queryResult = geocodingQuerySchema.safeParse(request.query);
  if (!queryResult.success) {
    return reply.code(400).send({
      error: 'Invalid query parameters',
      details: queryResult.error.format(),
    });
  }

  const { q, limit } = queryResult.data;
  const results = await geocodingService.search(q || '', limit);
  return reply.send({ results });
}
