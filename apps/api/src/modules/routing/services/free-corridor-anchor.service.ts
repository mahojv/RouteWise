import { Waypoint } from '@routewise/types';

export interface FreeCorridorAnchor {
  corridorName: string;
  anchor: Waypoint;
}

export class FreeCorridorAnchorService {
  /**
   * Puntos ancla conocidos de corredores libres en México
   * Se utilizan para trazar la Ruta Libre Base cuando la alternativa OSRM no es 100% libre
   */
  private knownAnchors = [
    {
      corridorName: 'Querétaro - CDMX (Libre Huichapan / Jilotepec)',
      bbox: { minLat: 19.3, maxLat: 20.8, minLng: -100.6, maxLng: -98.9 },
      anchor: {
        latitude: 20.3742,
        longitude: -99.6521,
        label: 'Vía Libre Huichapan / Jilotepec',
      },
    },
    {
      corridorName: 'Querétaro - Celaya (Libre 45)',
      bbox: { minLat: 20.4, maxLat: 20.7, minLng: -100.9, maxLng: -100.2 },
      anchor: {
        latitude: 20.5283,
        longitude: -100.5211,
        label: 'Carretera Libre 45 Querétaro - Celaya',
      },
    },
    {
      corridorName: 'CDMX - Puebla (Libre 190 Río Frío)',
      bbox: { minLat: 19.0, maxLat: 19.6, minLng: -99.2, maxLng: -98.1 },
      anchor: {
        latitude: 19.3501,
        longitude: -98.6832,
        label: 'Carretera Libre 190 México - Puebla',
      },
    },
  ];

  /**
   * Obtiene un punto ancla para forzar el trazado por carretera libre si coincide con un corredor conocido
   */
  public async getAnchor(origin: Waypoint, destination: Waypoint): Promise<Waypoint | null> {
    const latMid = (origin.latitude + destination.latitude) / 2;
    const lngMid = (origin.longitude + destination.longitude) / 2;

    for (const corr of this.knownAnchors) {
      if (
        latMid >= corr.bbox.minLat &&
        latMid <= corr.bbox.maxLat &&
        lngMid >= corr.bbox.minLng &&
        lngMid <= corr.bbox.maxLng
      ) {
        return corr.anchor;
      }
    }

    return null;
  }
}
