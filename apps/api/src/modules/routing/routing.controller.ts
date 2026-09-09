import { FastifyReply, FastifyRequest } from 'fastify';
import { RouteOptimizationService } from './route-optimizer.service';
import { calculateRouteSchema, routeSearchSchema } from '@routewise/validation';
import { RouteCalculationRequest, RouteSearchRequest } from '@routewise/types';
import { mapSearchRequestToCalculationRequest, mapCalculationResponseToSearchResponse } from './routing.adapter';

const optimizerService = new RouteOptimizationService();

export async function searchRouteHandler(request: FastifyRequest, reply: FastifyReply) {
  const parseResult = routeSearchSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid route search parameters',
      details: parseResult.error.format(),
    });
  }

  try {
    const calcReq = mapSearchRequestToCalculationRequest(parseResult.data as RouteSearchRequest);
    const rawResult = await optimizerService.optimizeRoute(calcReq);
    const searchResult = mapCalculationResponseToSearchResponse(rawResult);
    return reply.code(200).send(searchResult);
  } catch (err: any) {
    request.log.error({ err }, 'Error executing route search');
    
    // Si es un error de infraestructura / servicio no disponible
    if (err.message?.includes('OSRM') || err.message?.includes('ECONNREFUSED') || err.message?.includes('PostgreSQL')) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Routing service temporarily unavailable',
      });
    }

    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to search routes',
    });
  }
}

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
