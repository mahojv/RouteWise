import { FastifyReply, FastifyRequest } from 'fastify';
import { RouteOptimizationService } from './route-optimizer.service';
import { calculateRouteSchema } from '@routewise/validation';
import { RouteCalculationRequest } from '@routewise/types';

const optimizerService = new RouteOptimizationService();

export async function calculateRouteHandler(request: FastifyRequest, reply: FastifyReply) {
  const parseResult = calculateRouteSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.code(400).send({
      error: 'Invalid route calculation parameters',
      details: parseResult.error.format(),
    });
  }

  try {
    const result = await optimizerService.optimizeRoute(parseResult.data as unknown as RouteCalculationRequest);
    return reply.code(200).send(result);
  } catch (err: any) {
    request.log.error({ err }, 'Error optimizing route');
    return reply.code(500).send({
      error: 'Failed to calculate route',
      message: err.message || String(err),
    });
  }
}
