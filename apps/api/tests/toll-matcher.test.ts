import { describe, it, expect } from 'vitest';
import { TollMatcherService } from '../src/modules/tolls/toll-matcher.service';

describe('TollMatcherService Unit Tests', () => {
  const matcher = new TollMatcherService();

  const coords: [number, number][] = [
    [-100.3899, 20.5888], // Querétaro
    [-99.9349, 20.3069],  // Caseta Palmillas
    [-99.5000, 20.0000],  // Tramo intermedio 57D
    [-99.2075, 19.7144],  // Caseta Tepotzotlán
    [-99.1332, 19.4326],  // CDMX
  ];

  it('Matches toll plazas along route and orders them chronologically by routePosition', async () => {
    const events = await matcher.matchTollsAlongRoute(coords);

    expect(events.length).toBeGreaterThanOrEqual(2);

    // Verificar orden cronológico por progreso (0.0 a 1.0)
    for (let i = 1; i < events.length; i++) {
      expect(events[i].routePosition).toBeGreaterThanOrEqual(events[i - 1].routePosition);
    }

    // Primera caseta debe ser Palmillas y la segunda Tepotzotlán
    expect(events[0].name).toContain('Palmillas');
    expect(events[events.length - 1].name).toContain('Tepotzotlán');
  });

  it('Correctly marks isAvoided when tollPlazaId is in avoidTollIds', async () => {
    const events = await matcher.matchTollsAlongRoute(coords, {
      avoidTollIds: ['plaza-palmillas'],
    });

    const palmillas = events.find((e) => e.tollPlazaId === 'plaza-palmillas');
    expect(palmillas).toBeDefined();
    expect(palmillas?.isAvoided).toBe(true);

    const tepotzotlan = events.find((e) => e.tollPlazaId === 'plaza-tepotzotlan');
    expect(tepotzotlan).toBeDefined();
    expect(tepotzotlan?.isAvoided).toBe(false);
  });
});
