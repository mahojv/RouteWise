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
      return this.getMockResults(query, limit);
    }

    // 1. Intentar primero con INEGI Sakbe si hay API Key configurada en el servidor
    if (env.INEGI_SAKBE_API_KEY) {
      try {
        const body = new URLSearchParams({
          buscar: query.trim(),
          type: 'json',
          key: env.INEGI_SAKBE_API_KEY,
          num: String(limit),
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

        const response = await fetch('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', {
          method: 'POST',
          body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const json: any = await response.json();
          if (json && json.data && Array.isArray(json.data) && json.data.length > 0) {
            const inegiResults: GeocodingResult[] = [];
            for (const item of json.data) {
              try {
                const geo = typeof item.geojson === 'string' ? JSON.parse(item.geojson) : item.geojson;
                if (geo && geo.coordinates && Array.isArray(geo.coordinates)) {
                  inegiResults.push({
                    id: `inegi-${item.id_dest || Math.random()}`,
                    displayName: item.nombre ? `${item.nombre}${item.entidad ? `, ${item.entidad}` : ''}` : query,
                    latitude: parseFloat(geo.coordinates[1]),
                    longitude: parseFloat(geo.coordinates[0]),
                    type: item.subcategoria || 'place',
                    importance: 0.95,
                    address: {
                      city: item.municipio || item.nombre,
                      state: item.entidad,
                      country: 'México',
                    },
                  });
                }
              } catch {
                // Continuar si falla el parseo de un item individual
              }
            }

            if (inegiResults.length > 0) {
              this.cache.set(cacheKey, {
                data: inegiResults,
                expiresAt: Date.now() + env.CACHE_TTL_SECONDS * 1000,
              });
              return inegiResults;
            }
          }
        }
      } catch {
        // Continuar hacia Nominatim si falla INEGI Sakbe
      }
    }

    // 2. Fallback a OpenStreetMap Nominatim
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
        return this.getMockResults(query, limit);
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
      return this.getMockResults(query, limit);
    }
  }

  private getMockResults(query: string, limit: number = 5): GeocodingResult[] {
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

    const results = filtered.length > 0 ? filtered : mexicanCities;
    return results.slice(0, limit);
  }
}
