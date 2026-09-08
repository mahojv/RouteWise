import { getDbPool } from './index';

export async function runMigrations() {
  const pool = getDbPool();
  const client = await pool.connect();

  console.log('🔄 Initializing database & PostGIS extensions...');

  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "postgis";`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email TEXT,
        name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        fuel_type TEXT NOT NULL DEFAULT 'gasolina_regular',
        fuel_consumption DOUBLE PRECISION NOT NULL DEFAULT 14.0,
        fuel_price DOUBLE PRECISION NOT NULL DEFAULT 24.50,
        vehicle_type TEXT NOT NULL DEFAULT 'automovil',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        url TEXT,
        description TEXT,
        last_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS toll_plazas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        operator TEXT NOT NULL DEFAULT 'CAPUFE',
        highway TEXT,
        road TEXT,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        geom GEOMETRY(Point, 4326),
        direction TEXT NOT NULL DEFAULT 'both',
        km_marker DOUBLE PRECISION,
        source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS toll_plazas_geom_idx ON toll_plazas USING GIST (geom);
      CREATE INDEX IF NOT EXISTS toll_plazas_highway_idx ON toll_plazas(highway);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS toll_rates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        toll_plaza_id UUID NOT NULL REFERENCES toll_plazas(id) ON DELETE CASCADE,
        vehicle_type TEXT NOT NULL DEFAULT 'automovil',
        cash_price DOUBLE PRECISION NOT NULL,
        electronic_price DOUBLE PRECISION,
        currency TEXT NOT NULL DEFAULT 'MXN',
        source_id UUID REFERENCES data_sources(id) ON DELETE SET NULL,
        effective_from TIMESTAMPTZ,
        effective_until TIMESTAMPTZ,
        last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS toll_rates_plaza_vehicle_idx ON toll_rates(toll_plaza_id, vehicle_type);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS toll_bypasses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        toll_plaza_id UUID NOT NULL REFERENCES toll_plazas(id) ON DELETE CASCADE,
        direction TEXT NOT NULL DEFAULT 'both',
        exit_lat DOUBLE PRECISION NOT NULL,
        exit_lng DOUBLE PRECISION NOT NULL,
        reentry_lat DOUBLE PRECISION NOT NULL,
        reentry_lng DOUBLE PRECISION NOT NULL,
        exit_name TEXT,
        reentry_name TEXT,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        is_verified BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS toll_bypasses_plaza_idx ON toll_bypasses(toll_plaza_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS route_searches (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        origin_lat DOUBLE PRECISION NOT NULL,
        origin_lon DOUBLE PRECISION NOT NULL,
        origin_label TEXT,
        destination_lat DOUBLE PRECISION NOT NULL,
        destination_lon DOUBLE PRECISION NOT NULL,
        destination_label TEXT,
        vehicle_id UUID REFERENCES vehicles(id),
        fuel_price DOUBLE PRECISION NOT NULL,
        fuel_consumption DOUBLE PRECISION NOT NULL,
        time_value DOUBLE PRECISION NOT NULL,
        preference TEXT NOT NULL DEFAULT 'BALANCED',
        avoid_tolls JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS route_results (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        route_search_id UUID NOT NULL REFERENCES route_searches(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        distance_meters INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL,
        toll_cost DOUBLE PRECISION NOT NULL,
        fuel_cost DOUBLE PRECISION NOT NULL,
        total_cost DOUBLE PRECISION NOT NULL,
        score DOUBLE PRECISION NOT NULL,
        geometry JSONB NOT NULL,
        toll_plaza_ids JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS route_segments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        route_result_id UUID NOT NULL REFERENCES route_results(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        distance_meters INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL,
        toll_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        geometry JSONB NOT NULL
      );
    `);

    console.log('✅ PostGIS migrations applied successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
