import { create } from 'zustand';
import {
  Waypoint,
  RouteCalculationResponse,
  RouteCalculationRequest,
  Vehicle,
  RoutePreferenceMode,
} from '@routewise/types';

interface RouteState {
  origin: Waypoint | null;
  destination: Waypoint | null;
  vehicle: Partial<Vehicle>;
  preferenceMode: RoutePreferenceMode;
  timeValue: number;
  avoidTollPlazaIds: string[];
  calculationResult: RouteCalculationResponse | null;
  selectedRouteId: string | null;
  isLoading: boolean;
  error: string | null;

  setOrigin: (origin: Waypoint) => void;
  setDestination: (destination: Waypoint) => void;
  setVehicle: (vehicle: Partial<Vehicle>) => void;
  setPreferenceMode: (mode: RoutePreferenceMode) => void;
  setTimeValue: (val: number) => void;
  setSelectedRouteId: (id: string) => void;
  toggleAvoidToll: (tollId: string) => void;
  computeRoute: () => Promise<void>;
  reset: () => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  origin: {
    latitude: 20.5888,
    longitude: -100.3899,
    label: 'Santiago de Querétaro, QRO',
  },
  destination: {
    latitude: 19.4326,
    longitude: -99.1332,
    label: 'Ciudad de México, CDMX',
  },
  vehicle: {
    fuelConsumption: 14.5,
    fuelPrice: 24.50,
    vehicleType: 'automovil',
    name: 'Auto Particular',
  },
  preferenceMode: 'BALANCED',
  timeValue: 120, // $120 MXN/hr
  avoidTollPlazaIds: [],
  calculationResult: null,
  selectedRouteId: null,
  isLoading: false,
  error: null,

  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  setVehicle: (vehicle) => set((s) => ({ vehicle: { ...s.vehicle, ...vehicle } })),
  setPreferenceMode: (preferenceMode) => set({ preferenceMode }),
  setTimeValue: (timeValue) => set({ timeValue }),
  setSelectedRouteId: (selectedRouteId) => set({ selectedRouteId }),
  toggleAvoidToll: (tollId) =>
    set((s) => {
      const exists = s.avoidTollPlazaIds.includes(tollId);
      const avoidTollPlazaIds = exists
        ? s.avoidTollPlazaIds.filter((id) => id !== tollId)
        : [...s.avoidTollPlazaIds, tollId];
      return { avoidTollPlazaIds };
    }),

  computeRoute: async () => {
    const { origin, destination, vehicle, preferenceMode, timeValue, avoidTollPlazaIds } = get();
    if (!origin || !destination) return;

    set({ isLoading: true, error: null });

    const payload: RouteCalculationRequest = {
      origin,
      destination,
      vehicle: {
        fuelConsumption: vehicle.fuelConsumption,
        fuelPrice: vehicle.fuelPrice,
        vehicleType: vehicle.vehicleType,
      },
      preferences: {
        mode: preferenceMode,
        timeValue,
      },
      avoidTollPlazaIds,
    };

    try {
      const response = await fetch('http://localhost:3000/api/v1/routes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.statusText}`);
      }

      const data: RouteCalculationResponse = await response.json();
      set({
        calculationResult: data,
        selectedRouteId: data.recommendedRouteId || data.routes[0]?.id || null,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        error: err.message || 'Error al calcular rutas',
        isLoading: false,
      });
    }
  },

  reset: () =>
    set({
      avoidTollPlazaIds: [],
      calculationResult: null,
      selectedRouteId: null,
      error: null,
    }),
}));
