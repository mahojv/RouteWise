import { Coordinate } from '@routewise/types';

export const FIXTURE_CURATED_BYPASSES: Record<string, {
  exitPoint: Coordinate;
  reentryPoint: Coordinate;
  name: string;
  confidence: number;
  isVerified: boolean;
}> = {
  'plaza-palmillas': {
    exitPoint: { latitude: 20.3742, longitude: -99.6521 },
    reentryPoint: { latitude: 20.2450, longitude: -99.5850 },
    name: 'Bypass San Juan del Río / Huichapan / Nopala (Carretera Libre 45/55)',
    confidence: 1.0,
    isVerified: true,
  },
  'plaza-tepotzotlan': {
    exitPoint: { latitude: 19.8550, longitude: -99.2880 },
    reentryPoint: { latitude: 19.7480, longitude: -99.1650 },
    name: 'Bypass Jorobas / Teoloyucan / Cuautitlán (Carretera Libre Huehuetoca)',
    confidence: 1.0,
    isVerified: true,
  },
};
