import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),

  // Database
  DATABASE_URL: z.string().default(process.env.DATABASE_URL || 'postgresql://localhost:5432/routewise'),

  // Routing
  ROUTING_PROVIDER: z.enum(['osrm', 'ors', 'mock']).default('osrm'),
  OSRM_URL: z.string().default('http://localhost:5000'),
  ORS_URL: z.string().default('http://localhost:8080'),
  ORS_API_KEY: z.string().optional(),

  // Geocoding
  GEOCODING_PROVIDER: z.enum(['nominatim', 'mock']).default('nominatim'),
  NOMINATIM_URL: z.string().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().default('RouteWise/1.0 (contact@routewise.app)'),

  // Caching & Limits
  CACHE_ENABLED: z.coerce.boolean().default(true),
  CACHE_TTL_SECONDS: z.coerce.number().default(3600),
  RATE_LIMIT_MAX: z.coerce.number().default(60),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
});

export const env = envSchema.parse(process.env);
