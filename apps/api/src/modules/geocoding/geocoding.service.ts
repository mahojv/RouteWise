import { env } from '../../config/env';
import { GeocodingResult } from '@routewise/types';

export class GeocodingService {
  private cache = new Map<string, { data: GeocodingResult[]; expiresAt: number }>();
  private lastRequestTime = 0;

  public async search(query: string, limit: number = 5): Promise<GeocodingResult[]> {
    const cacheKey = `${query.toLowerCase().trim()}_${limit}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    if (env.GEOCODING_PROVIDER === 'mock') {
      return this.getMockResults(query);
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - elapsed));
    }
    this.lastRequestTime = Date.now();

    try {
      const url = `${env.NOMINATIM_URL}/search?q=${encodeURIComponent(
        query
      )}&format=json&addressdetails=1&countrycodes=mx&limit=${limit}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': env.NOMINATIM_USER_AGENT,
          'Accept-Language': 'es-MX,es;q=0.9',
        },
      });

      if (!response.ok) {
        return this.getMockResults(query);
      }

      const data = (await response.json()) as any[];
      const results: GeocodingResult[] = data.map((item) => ({
        id: String(item.place_id),
        displayName: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        type: item.type || 'place',
        importance: item.importance || 0.5,
        address: {
          city: item.address?.city || item.address?.town || item.address?.state_district,
          state: item.address?.state,
          country: item.address?.country,
          postcode: item.address?.postcode,
        },
      }));

      this.cache.set(cacheKey, {
        data: results,
        expiresAt: Date.now() + env.CACHE_TTL_SECONDS * 1000,
      });

      return results;
    } catch {
      return this.getMockResults(query);
    }
  }

  private getMockResults(query: string): GeocodingResult[] {
    const q = query.toLowerCase();
    const mexicanCities: GeocodingResult[] = [
      {
        id: 'qro-1',
        displayName: 'Santiago de Querétaro, Querétaro, México',
        latitude: 20.5888,
        longitude: -100.3899,
        type: 'city',
        importance: 0.9,
        address: { city: 'Querétaro', state: 'Querétaro', country: 'México' },
      },
      {
        id: 'cdmx-1',
        displayName: 'Ciudad de México, CDMX, México',
        latitude: 19.4326,
        longitude: -99.1332,
        type: 'city',
        importance: 1.0,
        address: { city: 'Ciudad de México', state: 'CDMX', country: 'México' },
      },
      {
        id: 'slp-1',
        displayName: 'San Luis Potosí, San Luis Potosí, México',
        latitude: 22.1565,
        longitude: -100.9855,
        type: 'city',
        importance: 0.85,
        address: { city: 'San Luis Potosí', state: 'San Luis Potosí', country: 'México' },
      },
    ];

    const filtered = mexicanCities.filter((c) =>
      c.displayName.toLowerCase().includes(q)
    );

    return filtered.length > 0 ? filtered : [mexicanCities[0]];
  }
}
