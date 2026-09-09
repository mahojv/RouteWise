import { getApiBaseUrl } from './api-client';

export interface LocationSuggestion {
  id: string;
  name: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
}

/**
 * Ciudades populares preconfiguradas en México para sugerencias offline/rápidas
 */
export const POPULAR_CITIES: LocationSuggestion[] = [
  { id: 'cdmx', name: 'Ciudad de México (CDMX)', subtitle: 'Zona Centro / Zócalo', latitude: 19.4326, longitude: -99.1332 },
  { id: 'qro', name: 'Santiago de Querétaro', subtitle: 'Querétaro', latitude: 20.5888, longitude: -100.3899 },
  { id: 'gdl', name: 'Guadalajara', subtitle: 'Jalisco', latitude: 20.6597, longitude: -103.3496 },
  { id: 'mty', name: 'Monterrey', subtitle: 'Nuevo León', latitude: 25.6866, longitude: -100.3161 },
  { id: 'pue', name: 'Puebla de Zaragoza', subtitle: 'Puebla', latitude: 19.0437, longitude: -98.1980 },
  { id: 'vsa', name: 'Villahermosa', subtitle: 'Tabasco', latitude: 17.9892, longitude: -92.9281 },
  { id: 'ver', name: 'Veracruz', subtitle: 'Veracruz', latitude: 19.1738, longitude: -96.1342 },
  { id: 'slp', name: 'San Luis Potosí', subtitle: 'San Luis Potosí', latitude: 22.1565, longitude: -100.9855 },
  { id: 'bjx', name: 'León', subtitle: 'Guanajuato', latitude: 21.1236, longitude: -101.6858 },
  { id: 'cun', name: 'Cancún', subtitle: 'Quintana Roo', latitude: 21.1619, longitude: -86.8515 },
  { id: 'oax', name: 'Oaxaca de Juárez', subtitle: 'Oaxaca', latitude: 17.0732, longitude: -96.7266 },
  { id: 'tol', name: 'Toluca', subtitle: 'Estado de México', latitude: 19.2826, longitude: -99.6557 },
];

/**
 * Búsqueda de ubicaciones a través del backend seguro de RouteWise
 */
export async function searchLocations(query: string, customBaseUrl?: string): Promise<LocationSuggestion[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const cleanQuery = query.trim();
  const baseUrl = customBaseUrl || getApiBaseUrl();
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/geocoding/search?q=${encodeURIComponent(cleanQuery)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data: any = await res.json();
      if (data && Array.isArray(data.results)) {
        return data.results.map((item: any) => ({
          id: item.id || `loc_${Math.random()}`,
          name: item.displayName ? item.displayName.split(',')[0].trim() : cleanQuery,
          subtitle: item.address?.state ? `${item.address.state}, México` : item.displayName || 'Ubicación en México',
          latitude: item.latitude,
          longitude: item.longitude,
        }));
      }
    }
  } catch {
    // Fallback silencioso a filtro local de ciudades populares si la API no está disponible
  }

  // Fallback offline a ciudades populares
  const q = cleanQuery.toLowerCase();
  return POPULAR_CITIES.filter((c) =>
    c.name.toLowerCase().includes(q) || (c.subtitle && c.subtitle.toLowerCase().includes(q))
  );
}
