import { TollEvent, TollBypassCandidate } from '@routewise/types';

export interface ResolvedTollBypass {
  toll: TollEvent;
  candidate: TollBypassCandidate;
}

export interface CriticalTollSelection {
  toll: TollEvent;
  candidate: TollBypassCandidate;
  priorityScore: number;
}

export class CriticalTollSelectorService {
  /**
   * Selecciona las casetas más críticas y rentables para explorar bypasses híbridos
   * Fórmula MVP: Priority = TollPrice × BypassConfidence
   * Desecha candidatos con confidence <= 0 o sin bypass
   */
  public selectTopCandidates(
    resolvedBypasses: ResolvedTollBypass[],
    maxCandidates = 2
  ): CriticalTollSelection[] {
    const scored: CriticalTollSelection[] = [];

    for (const item of resolvedBypasses) {
      const price = Number(item.toll.price || 0);
      const confidence = Number(item.candidate?.confidence || 0);

      if (price > 0 && confidence > 0) {
        const priorityScore = Math.round(price * confidence * 100) / 100;
        scored.push({
          toll: item.toll,
          candidate: item.candidate,
          priorityScore,
        });
      }
    }

    // Ordenar descendentemente por puntaje de prioridad
    scored.sort((a, b) => b.priorityScore - a.priorityScore);

    return scored.slice(0, maxCandidates);
  }
}
