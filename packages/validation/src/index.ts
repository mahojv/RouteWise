import { z } from 'zod';

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const waypointSchema = coordinateSchema.extend({
  label: z.string().max(255).optional(),
});

export const vehicleTypeSchema = z.enum([
  'automovil',
  'motocicleta',
  'camion_2_ejes',
  'camion_3_ejes',
  'camion_4_plus',
  'autobus',
]);

export const tollVehicleTypeSchema = z.enum([
  'CAR',
  'MOTORCYCLE',
  'BUS',
  'TRUCK',
]);

export const tollPaymentMethodSchema = z.enum([
  'CASH',
  'ELECTRONIC',
  'ANY',
]);

export const tollPriceStatusSchema = z.enum([
  'VALID',
  'OUTDATED',
  'UNKNOWN',
]);

export const fuelTypeSchema = z.enum([
  'gasolina_regular',
  'gasolina_premium',
  'diesel',
  'electrico',
  'hibrido',
]);

export const vehicleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  fuelType: fuelTypeSchema,
  fuelConsumption: z.number().positive().max(100),
  fuelPrice: z.number().positive().max(500),
  vehicleType: vehicleTypeSchema,
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const createVehicleSchema = vehicleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const routePreferenceModeSchema = z.enum(['MONEY', 'BALANCED', 'TIME']);

export const routePreferencesSchema = z.object({
  mode: routePreferenceModeSchema.default('BALANCED'),
  timeValue: z.number().nonnegative().max(5000).default(120),
});

export const routeSearchSchema = z.object({
  origin: waypointSchema,
  destination: waypointSchema,
  vehicle: z
    .object({
      type: vehicleTypeSchema.optional(),
      fuelType: fuelTypeSchema.optional(),
      fuelEfficiencyKmPerLiter: z.number().positive().max(100).optional(),
      fuelPricePerLiter: z.number().positive().max(500).optional(),
    })
    .optional(),
  preferences: z
    .object({
      strategy: routePreferenceModeSchema.optional(),
      timeValue: z.number().nonnegative().max(5000).optional(),
    })
    .optional(),
});

export const calculateRouteSchema = z.object({
  origin: waypointSchema,
  destination: waypointSchema,
  vehicle: z
    .object({
      fuelConsumption: z.number().positive().max(100).optional(),
      fuelPrice: z.number().positive().max(500).optional(),
      vehicleType: vehicleTypeSchema.optional(),
    })
    .optional(),
  preferences: routePreferencesSchema.optional(),
  avoidTollPlazaIds: z.array(z.string()).optional().default([]),
});

export const recalculateRouteSchema = z.object({
  avoidTollPlazaIds: z.array(z.string()).default([]),
});

export const tollPlazaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  operator: z.string().min(1).max(255),
  highway: z.string().max(255).optional(),
  road: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  direction: z.enum(['both', 'north', 'south', 'east', 'west']).default('both'),
  kmMarker: z.number().nonnegative().optional(),
  vehicleType: vehicleTypeSchema.default('automovil'),
  cashPrice: z.number().nonnegative(),
  electronicPrice: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('MXN'),
  source: z.string().default('CAPUFE'),
  sourceId: z.string().uuid().optional(),
  sourceReference: z.string().max(255).optional(),
});

export const tollRateSchema = z.object({
  id: z.string().uuid().optional(),
  tollPlazaId: z.string().uuid(),
  vehicleType: tollVehicleTypeSchema.default('CAR'),
  paymentMethod: tollPaymentMethodSchema.default('CASH'),
  price: z.number().nonnegative(),
  currency: z.string().length(3).default('MXN'),
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime().optional(),
  sourceId: z.string().uuid().optional(),
  sourceReference: z.string().max(255).optional(),
});

export const tollQueryFilterSchema = z.object({
  highway: z.string().optional(),
  vehicleType: tollVehicleTypeSchema.optional(),
  operator: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const geocodingQuerySchema = z.object({
  q: z.string().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  countryCodes: z.string().default('mx'),
});
