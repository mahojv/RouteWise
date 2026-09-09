import { Coordinate } from '@routewise/types';
import { getDbPool } from '../../database';
import { normalizePlazaName, normalizeHighway } from './import/normalizer';
import { env } from '../../config/env';

export interface InegiLiveSyncResult {
  liveTollsFound: number;
  cuotaTollsFound: number;
  libreTollsFound: number;
  updatedPrices: Map<string, number>;
  totalCuotaCost?: number;
  totalLibreCost?: number;
}

export class InegiLiveSyncService {
  private getApiKey(): string {
    return process.env.INEGI_SAKBE_API_KEY || env.INEGI_SAKBE_API_KEY || '';
  }

  /**
   * Consulta a la API oficial de INEGI Sakbe v3.1 en tiempo real usando coordenadas exactas (buscalinea)
   * o nombres de destino (buscadestino).
   */
  async syncLiveTariffs(
    origin: Coordinate,
    destination: Coordinate,
    vehicleType = 'automovil'
  ): Promise<InegiLiveSyncResult> {
    const key = this.getApiKey();
    const updatedPrices = new Map<string, number>();

    try {
      let origId: string | null = null;
      let origSource: string | null = null;
      let origTarget: string | null = null;

      let destId: string | null = null;
      let destSource: string | null = null;
      let destTarget: string | null = null;

      // Helper para fetch con timeout rápido de 5s
      const fetchWithTimeout = async (url: string, body: URLSearchParams): Promise<any> => {
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(url, { method: 'POST', body, signal: controller.signal });
          return await res.json();
        } finally {
          clearTimeout(tId);
        }
      };

      // 1. Intentar resolver origen y destino en paralelo por coordenadas (buscalinea)
      const bodyOrigLine = new URLSearchParams({ x: String(origin.longitude), y: String(origin.latitude), escala: '10000', type: 'json', key });
      const bodyDestLine = new URLSearchParams({ x: String(destination.longitude), y: String(destination.latitude), escala: '10000', type: 'json', key });

      const [jsonOrig, jsonDest] = await Promise.all([
        fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscalinea', bodyOrigLine).catch(() => null),
        fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscalinea', bodyDestLine).catch(() => null),
      ]);

      if (jsonOrig?.data?.id_routing_net) {
        origId = String(jsonOrig.data.id_routing_net);
        origSource = String(jsonOrig.data.source);
        origTarget = String(jsonOrig.data.target);
      }

      if (jsonDest?.data?.id_routing_net) {
        destId = String(jsonDest.data.id_routing_net);
        destSource = String(jsonDest.data.source);
        destTarget = String(jsonDest.data.target);
      }

      // 2. Si buscalinea por coordenadas no devolvió IDs, intentar por nombre de ciudad en paralelo
      let isDestToDest = false;
      let destOrigId: string | null = null;
      let destDestId: string | null = null;

      if (!origId || !destId) {
        const cleanName = (s?: string) => (s ? s.split(',')[0].trim() : '');
        const origCity = cleanName((origin as any).label) || 'Queretaro';
        const destCity = cleanName((destination as any).label) || 'Chihuahua';

        const bodyO = new URLSearchParams({ buscar: origCity, type: 'json', key, num: '3' });
        const bodyD = new URLSearchParams({ buscar: destCity, type: 'json', key, num: '3' });

        const [jsonO, jsonD] = await Promise.all([
          fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', bodyO).catch(() => null),
          fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/buscadestino', bodyD).catch(() => null),
        ]);

        destOrigId = jsonO?.data?.[0]?.id_dest || null;
        destDestId = jsonD?.data?.[0]?.id_dest || null;

        if (destOrigId && destDestId) {
          isDestToDest = true;
        }
      }

      // Si no fue posible resolver ni por coordenadas ni por nombre, terminar
      if (!isDestToDest && (!origId || !destId)) {
        return { liveTollsFound: 0, cuotaTollsFound: 0, libreTollsFound: 0, updatedPrices };
      }

      // 3. Consultar detalle de casetas a la API de INEGI Sakbe (detalle_c y detalle_l por separado)
      const vehicleCode = vehicleType === 'motocicleta' ? '0' : vehicleType === 'autobus' ? '2' : vehicleType === 'camion_2_ejes' ? '5' : '1';

      const routeBody = isDestToDest
        ? new URLSearchParams({
          dest_i: String(destOrigId),
          dest_f: String(destDestId),
          v: vehicleCode,
          type: 'json',
          key,
        })
        : new URLSearchParams({
          id_i: String(origId),
          source_i: String(origSource),
          target_i: String(origTarget),
          id_f: String(destId),
          source_f: String(destSource),
          target_f: String(destTarget),
          v: vehicleCode,
          type: 'json',
          key,
        });

      // Consultar detalle_c (cuota) y detalle_l (libre) en paralelo
      const [detailCuotaJson, detailLibreJson] = await Promise.all([
        fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/detalle_c', routeBody).catch(() => null),
        fetchWithTimeout('https://gaia.inegi.org.mx/sakbe_v3.1/detalle_l', routeBody).catch(() => null),
      ]);

      const parser = new (await import('./sakbe-toll-parser.service')).SakbeTollParserService();
      const cuotaItems = detailCuotaJson?.data ? parser.parseSakbeDetail(detailCuotaJson, 'SAKBE_DETALLE_C') : [];
      const libreItems = detailLibreJson?.data ? parser.parseSakbeDetail(detailLibreJson, 'SAKBE_DETALLE_L') : [];

      // Calcular costos y registrar precios para cada ruta de forma independiente
      let totalCuotaCost = 0;
      for (const item of cuotaItems) {
        if (item.price !== null && item.priceStatus === 'VALID') {
          totalCuotaCost += item.price;
          updatedPrices.set(item.name, item.price);
        }
      }

      let totalLibreCost = 0;
      for (const item of libreItems) {
        if (item.price !== null && item.priceStatus === 'VALID') {
          totalLibreCost += item.price;
          // Solo registrar en updatedPrices si no fue ya definida por la ruta de cuota
          if (!updatedPrices.has(item.name)) {
            updatedPrices.set(item.name, item.price);
          }
        }
      }

      // Persistir descubrimientos de cada ruta por separado conservando su origen
      if (cuotaItems.length > 0) {
        await parser.persistDiscoveredTolls(cuotaItems, vehicleType as any);
      }
      if (libreItems.length > 0) {
        await parser.persistDiscoveredTolls(libreItems, vehicleType as any);
      }

      const cuotaTollsFound = cuotaItems.length;
      const libreTollsFound = libreItems.length;
      const liveTollsFound = cuotaTollsFound + libreTollsFound;

      console.log(`📡 INEGI Sakbe Live Sync: Cuota [${cuotaTollsFound} casetas, $${totalCuotaCost} MXN] | Libre [${libreTollsFound} casetas, $${totalLibreCost} MXN]`);

      return {
        liveTollsFound,
        cuotaTollsFound,
        libreTollsFound,
        updatedPrices,
        totalCuotaCost,
        totalLibreCost,
      };
    } catch (err) {
      console.warn('⚠️ Falló la sincronización en vivo con INEGI Sakbe:', err);
      return { liveTollsFound: 0, cuotaTollsFound: 0, libreTollsFound: 0, updatedPrices };
    }
  }
}
