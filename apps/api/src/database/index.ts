import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    const currentPool = getDbPool();
    dbInstance = drizzle(currentPool, { schema });
  }
  return dbInstance;
}

export async function checkDatabaseHealth(): Promise<{
  status: 'connected' | 'disconnected' | 'disabled';
  postgisEnabled: boolean;
  latencyMs?: number;
}> {
  const startTime = Date.now();
  try {
    const currentPool = getDbPool();
    const client = await currentPool.connect();
    try {
      const postgisCheck = await client.query(
        "SELECT default_version, installed_version FROM pg_available_extensions WHERE name = 'postgis';"
      );
      const postgisEnabled = Boolean(postgisCheck.rows?.[0]?.installed_version);

      return {
        status: 'connected',
        postgisEnabled,
        latencyMs: Date.now() - startTime,
      };
    } finally {
      client.release();
    }
  } catch (err) {
    return {
      status: 'disconnected',
      postgisEnabled: false,
      latencyMs: Date.now() - startTime,
    };
  }
}
