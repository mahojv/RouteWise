export interface TimeCalculationResult {
  durationHours: number;
  timeCost: number;
}

export class TimeCostService {
  /**
   * Calcula el costo de oportunidad del tiempo según la duración y el valor horario del usuario
   * @param durationSeconds Duración del viaje en segundos
   * @param hourlyTimeValue Valor de una hora de tiempo del usuario ($/hr)
   */
  public calculate(
    durationSeconds: number,
    hourlyTimeValue: number
  ): TimeCalculationResult {
    if (durationSeconds <= 0 || hourlyTimeValue <= 0) {
      return { durationHours: 0, timeCost: 0 };
    }

    const durationHours = durationSeconds / 3600.0;
    const timeCost = durationHours * hourlyTimeValue;

    return {
      durationHours: Math.round(durationHours * 100) / 100,
      timeCost: Math.round(timeCost * 100) / 100,
    };
  }
}
