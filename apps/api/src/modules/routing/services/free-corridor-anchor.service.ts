import { Waypoint } from '@routewise/types';

export interface FreeCorridorAnchor {
  corridorName: string;
  anchors: Waypoint[];
}

export class FreeCorridorAnchorService {
  /**
   * Puntos ancla conocidos de corredores libres en México
   * Se utilizan para trazar la Ruta Libre Base cuando la alternativa OSRM no es 100% libre
   */
  private knownAnchors = [
    {
      corridorName: 'Querétaro - CDMX (Libre Huichapan / Teoloyucan)',
      bbox: { minLat: 19.3, maxLat: 20.8, minLng: -100.6, maxLng: -98.9 },
      anchors: [
        {
          latitude: 20.3742,
          longitude: -99.6521,
          label: 'Vía Libre Huichapan / Jilotepec',
        },
        {
          latitude: 19.7480,
          longitude: -99.1650,
          label: 'Vía Libre Teoloyucan / Cuautitlán',
        },
      ],
    },
    {
      corridorName: 'Querétaro - Celaya (Libre 45)',
      bbox: { minLat: 20.4, maxLat: 20.7, minLng: -100.9, maxLng: -100.2 },
      anchors: [
        {
          latitude: 20.5283,
          longitude: -100.5211,
          label: 'Carretera Libre 45 Querétaro - Celaya',
        },
      ],
    },
    {
      corridorName: 'CDMX - Puebla (Libre 190 Río Frío)',
      bbox: { minLat: 19.0, maxLat: 19.6, minLng: -99.2, maxLng: -98.1 },
      anchors: [
        {
          latitude: 19.3501,
          longitude: -98.6832,
          label: 'Carretera Libre 190 México - Puebla',
        },
      ],
    },
  ];

  /**
   * Obtiene puntos ancla para forzar el trazado por carretera libre si coincide con un corredor conocido
   */
  public async getAnchors(origin: Waypoint, destination: Waypoint): Promise<Waypoint[] | null> {
    const latMid = (origin.latitude + destination.latitude) / 2;
    const lngMid = (origin.longitude + destination.longitude) / 2;

    for (const corr of this.knownAnchors) {
      if (
        latMid >= corr.bbox.minLat &&
        latMid <= corr.bbox.maxLat &&
        lngMid >= corr.bbox.minLng &&
        lngMid <= corr.bbox.maxLng
      ) {
        return corr.anchors;
      }
    }

    return null;
  }

  // Deprecated fallback method
  public async getAnchor(origin: Waypoint, destination: Waypoint): Promise<Waypoint | null> {
    const anchors = await this.getAnchors(origin, destination);
    return anchors && anchors.length > 0 ? anchors[0] : null;
  }
}

