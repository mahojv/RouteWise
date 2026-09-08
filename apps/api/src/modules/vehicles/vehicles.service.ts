import { getDb } from '../../database';
import { vehicles } from '../../database/schema';
import { DEFAULT_VEHICLES } from '@routewise/config';
import { eq } from 'drizzle-orm';

export class VehiclesService {
  public async listVehicles(): Promise<any[]> {
    try {
      const db = getDb();
      const rows = await db.select().from(vehicles);
      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // Fallback
    }

    return DEFAULT_VEHICLES.map((v: any, i: number) => ({
      id: `preset-${i + 1}`,
      ...v,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  public async getVehicleById(id: string): Promise<any | null> {
    try {
      const db = getDb();
      const rows = await db.select().from(vehicles).where(eq(vehicles.id, id));
      return rows[0] || null;
    } catch {
      return null;
    }
  }
}
