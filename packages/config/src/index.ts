import { Vehicle, VehicleType, FuelType, RoutePreferenceMode } from '@routewise/types';

export const DEFAULT_CONFIG = {
  defaultFuelPrice: 24.50,
  defaultPremiumFuelPrice: 26.20,
  defaultDieselPrice: 25.80,
  defaultFuelConsumption: 14.0,

  defaultTimeValue: 120.0,
  minTimeValue: 20.0,
  maxTimeValue: 1000.0,

  tollMatchingRadiusMeters: 120,
  minTimeDifferenceSeconds: 180,
  minDistanceDifferenceMeters: 1000,
  minCostDifferenceMxn: 10.0,

  nominatimMinDelayMs: 1000,
} as const;

export const PREFERENCE_WEIGHTS: Record<RoutePreferenceMode, { weightCost: number; weightTime: number }> = {
  MONEY: {
    weightCost: 0.75,
    weightTime: 0.25,
  },
  BALANCED: {
    weightCost: 0.50,
    weightTime: 0.50,
  },
  TIME: {
    weightCost: 0.25,
    weightTime: 0.75,
  },
};

export const DEFAULT_VEHICLES: Array<Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'Sedán Compacto (e.g. Mazda 3 / Versa)',
    fuelType: 'gasolina_regular' as FuelType,
    fuelConsumption: 14.5,
    fuelPrice: 24.50,
    vehicleType: 'automovil' as VehicleType,
  },
  {
    name: 'SUV Familiar (e.g. CR-V / RAV4)',
    fuelType: 'gasolina_regular' as FuelType,
    fuelConsumption: 11.2,
    fuelPrice: 24.50,
    vehicleType: 'automovil' as VehicleType,
  },
  {
    name: 'Motocicleta (e.g. 250cc)',
    fuelType: 'gasolina_regular' as FuelType,
    fuelConsumption: 30.0,
    fuelPrice: 24.50,
    vehicleType: 'motocicleta' as VehicleType,
  },
  {
    name: 'Vehículo Eléctrico / Híbrido',
    fuelType: 'hibrido' as FuelType,
    fuelConsumption: 22.0,
    fuelPrice: 24.50,
    vehicleType: 'automovil' as VehicleType,
  },
];

export const THEME_COLORS = {
  background: {
    primary: '#0A0E17',
    secondary: '#111827',
    card: '#161F30',
    cardElevated: '#1E293B',
    glass: 'rgba(22, 31, 48, 0.85)',
  },
  border: {
    subtle: '#1F293D',
    active: '#38BDF8',
    glow: 'rgba(56, 189, 248, 0.25)',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',
    inverse: '#0A0E17',
  },
  accent: {
    primary: '#38BDF8',
    secondary: '#818CF8',
    toll: '#F59E0B',
    free: '#64748B',
    cheap: '#10B981',
    fast: '#3B82F6',
    warning: '#EF4444',
  },
} as const;

export function calculateFuelCost(distanceMeters: number, kmPerLiter: number, pricePerLiter: number): number {
  if (kmPerLiter <= 0 || pricePerLiter <= 0) return 0;
  const distanceKm = distanceMeters / 1000;
  const litersNeeded = distanceKm / kmPerLiter;
  return Math.round((litersNeeded * pricePerLiter) * 100) / 100;
}

export function calculateTimeCost(durationSeconds: number, timeValueMxnPerHour: number): number {
  const durationHours = durationSeconds / 3600;
  return Math.round((durationHours * timeValueMxnPerHour) * 100) / 100;
}
