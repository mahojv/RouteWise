import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Tabla de Usuarios (users)
 */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email'),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tabla de Vehículos (vehicles)
 */
export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fuelType: text('fuel_type').notNull().default('gasolina_regular'),
  fuelConsumption: doublePrecision('fuel_consumption').notNull().default(14.0), // km / L
  fuelPrice: doublePrecision('fuel_price').notNull().default(24.50), // MXN / L
  vehicleType: text('vehicle_type').notNull().default('automovil'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tabla de Fuentes de Datos (data_sources)
 * Registra orígenes oficiales (CAPUFE, FONADIN, etc.) y metadatos de licencias
 */
export const dataSources = pgTable('data_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(), // e.g. CAPUFE, FONADIN, CONCESIONARIO, OSM
  url: text('url'),
  sourceType: text('source_type').notNull().default('OFFICIAL_OPEN_DATA'),
  license: text('license').default('CC-BY-4.0'),
  lastImportAt: timestamp('last_import_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    providerIdx: index('data_sources_provider_idx').on(table.provider),
  };
});

/**
 * Tabla de Plazas de Cobro (toll_plazas) con soporte PostGIS
 */
export const tollPlazas = pgTable('toll_plazas', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  operator: text('operator').notNull().default('CAPUFE'),
  highway: text('highway'),
  road: text('road'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  direction: text('direction').notNull().default('both'), // both, north, south, east, west
  kmMarker: doublePrecision('km_marker'),
  vehicleType: text('vehicle_type').notNull().default('automovil'),
  cashPrice: doublePrecision('cash_price').notNull(),
  electronicPrice: doublePrecision('electronic_price'),
  currency: text('currency').notNull().default('MXN'),
  source: text('source').notNull().default('CAPUFE'),
  sourceId: uuid('source_id').references(() => dataSources.id),
  sourceReference: text('source_reference'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    nameHighwayIdx: index('toll_plazas_name_highway_idx').on(table.name, table.highway),
  };
});

/**
 * Tabla de Tarifas de Casetas (toll_rates)
 * Soporta múltiples precios históricos y vigentes por tipo de vehículo y forma de pago
 */
export const tollRates = pgTable('toll_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  tollPlazaId: uuid('toll_plaza_id')
    .references(() => tollPlazas.id, { onDelete: 'cascade' })
    .notNull(),
  vehicleType: text('vehicle_type').notNull().default('CAR'), // CAR, MOTORCYCLE, BUS, TRUCK
  paymentMethod: text('payment_method').notNull().default('CASH'), // CASH, ELECTRONIC, ANY
  price: doublePrecision('price').notNull(),
  currency: text('currency').notNull().default('MXN'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  sourceId: uuid('source_id').references(() => dataSources.id),
  sourceReference: text('source_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    rateLookupIdx: index('toll_rates_lookup_idx').on(
      table.tollPlazaId,
      table.vehicleType,
      table.effectiveFrom,
      table.effectiveUntil
    ),
    vehicleTypeIdx: index('toll_rates_vehicle_type_idx').on(table.vehicleType),
    plazaVehicleUnique: uniqueIndex('toll_rates_plaza_vehicle_unique_idx').on(
      table.tollPlazaId,
      table.vehicleType
    ),
  };
});

/**
 * Tabla de Bypasses Curados para Casetas (toll_bypasses)
 */
export const tollBypasses = pgTable('toll_bypasses', {
  id: uuid('id').defaultRandom().primaryKey(),
  tollPlazaId: uuid('toll_plaza_id')
    .references(() => tollPlazas.id, { onDelete: 'cascade' })
    .notNull(),
  direction: text('direction').notNull().default('both'), // north, south, both
  exitLat: doublePrecision('exit_lat').notNull(),
  exitLng: doublePrecision('exit_lng').notNull(),
  reentryLat: doublePrecision('reentry_lat').notNull(),
  reentryLng: doublePrecision('reentry_lng').notNull(),
  exitName: text('exit_name'),
  reentryName: text('reentry_name'),
  confidence: doublePrecision('confidence').notNull().default(1.0),
  isVerified: boolean('is_verified').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    plazaIdx: index('toll_bypasses_plaza_idx').on(table.tollPlazaId),
  };
});

/**
 * Registro y Auditoría de Búsquedas de Ruta (route_searches)
 */
export const routeSearches = pgTable('route_searches', {
  id: uuid('id').defaultRandom().primaryKey(),
  originLat: doublePrecision('origin_lat').notNull(),
  originLon: doublePrecision('origin_lon').notNull(),
  originLabel: text('origin_label'),
  destinationLat: doublePrecision('destination_lat').notNull(),
  destinationLon: doublePrecision('destination_lon').notNull(),
  destinationLabel: text('destination_label'),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id),
  fuelPrice: doublePrecision('fuel_price').notNull(),
  fuelConsumption: doublePrecision('fuel_consumption').notNull(),
  timeValue: doublePrecision('time_value').notNull(),
  preference: text('preference').notNull().default('BALANCED'),
  avoidTolls: jsonb('avoid_tolls').default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Resultados de Rutas Optimizadas (route_results)
 */
export const routeResults = pgTable('route_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  routeSearchId: uuid('route_search_id')
    .references(() => routeSearches.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(), // FAST, CHEAP, BALANCED, HYBRID, NO_TOLL
  provider: text('provider').notNull(),
  distanceMeters: integer('distance_meters').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  tollCost: doublePrecision('toll_cost').notNull(),
  fuelCost: doublePrecision('fuel_cost').notNull(),
  totalCost: doublePrecision('total_cost').notNull(),
  score: doublePrecision('score').notNull(),
  geometry: jsonb('geometry').notNull(),
  tollPlazaIds: jsonb('toll_plaza_ids').default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Segmentos de Ruta (route_segments)
 */
export const routeSegments = pgTable('route_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  routeResultId: uuid('route_result_id')
    .references(() => routeResults.id, { onDelete: 'cascade' })
    .notNull(),
  sequence: integer('sequence').notNull(),
  type: text('type').notNull(), // FREE, TOLL
  name: text('name'),
  distanceMeters: integer('distance_meters').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  tollCost: doublePrecision('toll_cost').notNull().default(0),
  geometry: jsonb('geometry').notNull(),
});
