import { create } from 'zustand';
import {
  Waypoint,
  RouteSearchRequest,
  RouteSearchResponse,
  PublicRouteOption,
  VehicleType,
  FuelType,
  RoutePreferenceMode,
} from '@routewise/types';
import { searchRoutes, RouteApiError } from '../services/api-client';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SearchErrorInfo {
  statusCode?: number;
  type: string;
  message: string;
}

interface RouteStoreState {
  // Input fields
  origin: Waypoint;
  destination: Waypoint;
  vehicleType: VehicleType;
  fuelType: FuelType;
  fuelEfficiencyKmPerLiter: number;
  fuelPricePerLiter: number;
  preferenceStrategy: RoutePreferenceMode;
  timeValue: number;

  // Search Results & State
  searchResult: RouteSearchResponse | null;
  selectedRouteId: string | null;
  status: SearchStatus;
  error: SearchErrorInfo | null;

  // Setters
  setOrigin: (origin: Waypoint) => void;
  setDestination: (destination: Waypoint) => void;
  setVehicleType: (type: VehicleType) => void;
  setFuelType: (type: FuelType) => void;
  setFuelEfficiencyKmPerLiter: (val: number) => void;
  setFuelPricePerLiter: (val: number) => void;
  setPreferenceStrategy: (strategy: RoutePreferenceMode) => void;
  setTimeValue: (val: number) => void;
  setSelectedRouteId: (id: string | null) => void;

  // Presets & Execution
  setPresetRoute: (presetKey: 'QRO_CDMX' | 'QRO_VSA') => void;
  executeSearch: (customBaseUrl?: string) => Promise<void>;
  reset: () => void;
}

const PRESET_LOCATIONS = {
  QRO: {
    latitude: 20.5888,
    longitude: -100.3899,
    label: 'Santiago de Querétaro, QRO',
  },
  CDMX: {
    latitude: 19.4326,
    longitude: -99.1332,
    label: 'Ciudad de México, CDMX',
  },
  VSA: {
    latitude: 17.9892,
    longitude: -92.9281,
    label: 'Villahermosa, TAB',
  },
};

export const useRouteStore = create<RouteStoreState>((set, get) => ({
  origin: PRESET_LOCATIONS.QRO,
  destination: PRESET_LOCATIONS.CDMX,
  vehicleType: 'automovil',
  fuelType: 'gasolina_regular',
  fuelEfficiencyKmPerLiter: 14.5,
  fuelPricePerLiter: 24.50,
  preferenceStrategy: 'BALANCED',
  timeValue: 120,

  searchResult: null,
  selectedRouteId: null,
  status: 'idle',
  error: null,

  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  setVehicleType: (vehicleType) => set({ vehicleType }),
  setFuelType: (fuelType) => set({ fuelType }),
  setFuelEfficiencyKmPerLiter: (fuelEfficiencyKmPerLiter) => set({ fuelEfficiencyKmPerLiter }),
  setFuelPricePerLiter: (fuelPricePerLiter) => set({ fuelPricePerLiter }),
  setPreferenceStrategy: (preferenceStrategy) => set({ preferenceStrategy }),
  setTimeValue: (timeValue) => set({ timeValue }),
  setSelectedRouteId: (selectedRouteId) => set({ selectedRouteId }),

  setPresetRoute: (presetKey) => {
    if (presetKey === 'QRO_CDMX') {
      set({
        origin: PRESET_LOCATIONS.QRO,
        destination: PRESET_LOCATIONS.CDMX,
      });
    } else if (presetKey === 'QRO_VSA') {
      set({
        origin: PRESET_LOCATIONS.QRO,
        destination: PRESET_LOCATIONS.VSA,
      });
    }
  },

  executeSearch: async (customBaseUrl?: string) => {
    const state = get();
    if (state.status === 'loading') return;

    set({ status: 'loading', error: null });

    const requestPayload: RouteSearchRequest = {
      origin: state.origin,
      destination: state.destination,
      vehicle: {
        type: state.vehicleType,
        fuelType: state.fuelType,
        fuelEfficiencyKmPerLiter: state.fuelEfficiencyKmPerLiter,
        fuelPricePerLiter: state.fuelPricePerLiter,
      },
      preferences: {
        strategy: state.preferenceStrategy,
        timeValue: state.timeValue,
      },
    };

    try {
      const response = await searchRoutes(requestPayload, customBaseUrl);
      
      const recommendedId = response.recommendedRouteId || response.routes[0]?.id || null;

      set({
        searchResult: response,
        selectedRouteId: recommendedId,
        status: 'success',
        error: null,
      });
    } catch (err: any) {
      if (err instanceof RouteApiError) {
        set({
          status: 'error',
          error: {
            statusCode: err.statusCode,
            type: err.errorType,
            message: err.userMessage,
          },
        });
      } else {
        set({
          status: 'error',
          error: {
            type: 'UNKNOWN_ERROR',
            message: err.message || 'Ocurrió un error inesperado al procesar la búsqueda.',
          },
        });
      }
    }
  },

  reset: () =>
    set({
      searchResult: null,
      selectedRouteId: null,
      status: 'idle',
      error: null,
    }),
}));
