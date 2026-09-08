import { FastifyInstance } from 'fastify';
import { searchGeocodingHandler } from './geocoding.controller';

export async function geocodingRoutes(fastify: FastifyInstance) {
  fastify.get('/geocoding/search', searchGeocodingHandler);
}
