import { VehicleType } from '@routewise/types';

/**
 * Normaliza nombres y códigos de carreteras federales y estatales mexicanas
 * Ejemplos: "MEX-57D", "57D", "MEX 057D", "CARRETERA 57D" -> "MEX-057D"
 */
export function normalizeHighway(input?: string): string | undefined {
  if (!input) return undefined;
  let cleaned = input.trim().toUpperCase();

  // Reemplazar espacios y guiones múltiples
  cleaned = cleaned.replace(/\s+/g, '-').replace(/-+/g, '-');

  // Si tiene formato como MEX-57D, 57D, MEX-057D, etc.
  const mexMatch = cleaned.match(/^(?:MEX-?|CARRETERA-?|AUTOPISTA-?)?(\d{1,3})([A-Z0-9]*)$/);
  if (mexMatch) {
    const num = mexMatch[1].padStart(3, '0');
    const suffix = mexMatch[2] ? mexMatch[2].replace(/^-/, '') : '';
    return `MEX-${num}${suffix}`;
  }

  return cleaned;
}

/**
 * Normaliza el nombre de la plaza de cobro / caseta
 */
export function normalizePlazaName(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:Cruce\s+la\s+caseta|CASETA\s+(?:DE\s+COBRO\s+)?)/i, '')
    .trim();
}

/**
 * Mapea nombres comunes de tipo de vehículo en México al enum VehicleType
 */
export function normalizeVehicleType(raw: string): VehicleType {
  const lower = (raw || '').trim().toLowerCase();

  if (lower.includes('moto')) return 'motocicleta';
  if (lower.includes('bus') || lower.includes('autobus') || lower.includes('autobús') || lower.includes('ómnibus')) {
    return 'autobus';
  }
  if (lower.includes('camion') || lower.includes('camión') || lower.includes('trailer') || lower.includes('rabón') || lower.includes('tortón')) {
    return 'camion_2_ejes';
  }
  if (lower.includes('auto') || lower.includes('carro') || lower.includes('sedan') || lower.includes('suv') || lower === '1') {
    return 'automovil';
  }

  return 'automovil';
}

/**
 * Valida si las coordenadas se encuentran dentro de la envolvente geográfica de México
 */
export function isWithinMexicoBounds(lat: number, lon: number): boolean {
  return lat >= 14.0 && lat <= 33.0 && lon >= -118.5 && lon <= -86.0;
}
