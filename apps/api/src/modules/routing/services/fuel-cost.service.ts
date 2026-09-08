export interface FuelCalculationResult {
  litersUsed: number;
  fuelCost: number;
}

export class FuelCostService {
  /**
   * Calcula el volumen de combustible y su costo para una distancia dada
   * @param distanceMeters Distancia en metros
   * @param consumptionKmPerLiter Rendimiento del vehículo en km/l
   * @param pricePerLiter Precio del combustible por litro
   */
  public calculate(
    distanceMeters: number,
    consumptionKmPerLiter: number,
    pricePerLiter: number
  ): FuelCalculationResult {
    if (consumptionKmPerLiter <= 0 || distanceMeters <= 0 || pricePerLiter <= 0) {
      return { litersUsed: 0, fuelCost: 0 };
    }

    const distanceKm = distanceMeters / 1000.0;
    const litersUsed = distanceKm / consumptionKmPerLiter;
    const fuelCost = litersUsed * pricePerLiter;

    return {
      litersUsed: Math.round(litersUsed * 100) / 100,
      fuelCost: Math.round(fuelCost * 100) / 100,
    };
  }
}
