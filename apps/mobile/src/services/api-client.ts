import { RouteSearchRequest, RouteSearchResponse } from '@routewise/types';

export class RouteApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorType: 'BAD_REQUEST' | 'SERVICE_UNAVAILABLE' | 'INTERNAL_ERROR' | 'NETWORK_ERROR',
    public readonly userMessage: string,
    public readonly details?: any
  ) {
    super(userMessage);
    this.name = 'RouteApiError';
  }
}

/**
 * Resolves the base URL for the API endpoint depending on platform and env vars.
 */
export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  
  let platformOS: string = 'web';
  try {
    // Dynamic require so non-React-Native node environments (e.g. Vitest) won't fail parsing
    const { Platform } = require('react-native');
    platformOS = Platform?.OS || 'web';
  } catch {
    platformOS = 'web';
  }

  if (platformOS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  
  return 'http://localhost:3000';
}

/**
 * Typed client for public route search API: POST /api/v1/routes/search
 */
export async function searchRoutes(
  request: RouteSearchRequest,
  customBaseUrl?: string
): Promise<RouteSearchResponse> {
  const baseUrl = customBaseUrl || getApiBaseUrl();
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/routes/search`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        // ignore json parse error on bad status
      }

      if (response.status === 400) {
        throw new RouteApiError(
          400,
          'BAD_REQUEST',
          'Los parámetros de búsqueda son inválidos. Verifica el origen, destino o configuración de vehículo.',
          errorData.details
        );
      }

      if (response.status === 503) {
        throw new RouteApiError(
          503,
          'SERVICE_UNAVAILABLE',
          'El servicio de optimización de rutas no está disponible temporalmente. Intenta nuevamente en un momento.'
        );
      }

      if (response.status === 500) {
        throw new RouteApiError(
          500,
          'INTERNAL_ERROR',
          'Ocurrió un error interno en el servidor al calcular las alternativas de ruta.'
        );
      }

      throw new RouteApiError(
        response.status,
        'INTERNAL_ERROR',
        `Error inesperado en el servidor (${response.status}).`
      );
    }

    const data: RouteSearchResponse = await response.json();
    return data;
  } catch (err: any) {
    if (err instanceof RouteApiError) {
      throw err;
    }

    if (err.name === 'AbortError') {
      throw new RouteApiError(
        0,
        'NETWORK_ERROR',
        'La solicitud al servidor excedió el tiempo límite (30s). Verifica tu conexión.'
      );
    }

    throw new RouteApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor de RouteWise. Asegúrate de que la API esté encendida.'
    );
  }
}
