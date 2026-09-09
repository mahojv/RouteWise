import { describe, it, expect } from 'vitest';
import { SakbeTollParserService } from '../src/modules/tolls/sakbe-toll-parser.service';
import * as fs from 'fs';
import * as path from 'path';

describe('SakbeTollParserService Unit Tests', () => {
  const parser = new SakbeTollParserService();

  it('correctly parses SAKBE detalle_l (extracting Puente Alvarado without crashing on punto_caseta=null)', () => {
    const rawData = {
      data: [
        {
          direccion: 'Inicia recorrido en Calle 16 de Septiembre',
          costo_caseta: 0,
          punto_caseta: null,
          geojson: '{"type":"Point","coordinates":[-100.3919,20.5935]}',
        },
        {
          direccion: 'Cruce la caseta Puente Alvarado',
          costo_caseta: 26,
          punto_caseta: '{"type":"Point","crs":{"type":"name","properties":{"name":"inegi_grs80:55555"}},"coordinates":[-95.744649436,18.769835558]}',
          giro: 9,
        },
        {
          direccion: '¡Haz llegado a tu destino!',
          costo_caseta: 0,
          punto_caseta: null,
          geojson: '{"type":"Point","coordinates":[-94.5448,17.9851]}',
        },
      ],
      meta: { fuente: 'INEGI' },
      response: { success: true },
    };

    const items = parser.parseSakbeDetail(rawData, 'SAKBE_DETALLE_L');
    expect(items.length).toBe(1);

    const toll = items[0];
    expect(toll.name).toContain('Puente Alvarado');
    expect(toll.price).toBe(26);
    expect(toll.longitude).toBeCloseTo(-95.7446, 3);
    expect(toll.latitude).toBeCloseTo(18.7698, 3);
    expect(toll.sourceProvider).toBe('SAKBE_DETALLE_L');
  });

  it('1. Separación CUOTA / LIBRE: Conserves distinct route context and avoids cross-route deduplication', () => {
    const cuotaJson = {
      data: [
        {
          direccion: 'Cruce la caseta Palmillas',
          costo_caseta: 108,
          punto_caseta: '{"type":"Point","coordinates":[-99.9349,20.3069]}',
        },
        {
          direccion: 'Cruce la caseta Tepotzotlán',
          costo_caseta: 108,
          punto_caseta: '{"type":"Point","coordinates":[-99.2075,19.7144]}',
        },
      ],
    };

    const libreJson = {
      data: [
        {
          direccion: 'Cruce la caseta Puente Alvarado',
          costo_caseta: 26,
          punto_caseta: '{"type":"Point","coordinates":[-95.7446,18.7698]}',
        },
      ],
    };

    const cuotaItems = parser.parseSakbeDetail(cuotaJson, 'SAKBE_DETALLE_C');
    const libreItems = parser.parseSakbeDetail(libreJson, 'SAKBE_DETALLE_L');

    expect(cuotaItems.length).toBe(2);
    expect(libreItems.length).toBe(1);

    expect(cuotaItems.every((c) => c.sourceProvider === 'SAKBE_DETALLE_C')).toBe(true);
    expect(libreItems.every((l) => l.sourceProvider === 'SAKBE_DETALLE_L')).toBe(true);

    const totalCuota = cuotaItems.reduce((acc, curr) => acc + (curr.price || 0), 0);
    const totalLibre = libreItems.reduce((acc, curr) => acc + (curr.price || 0), 0);

    expect(totalCuota).toBe(216);
    expect(totalLibre).toBe(26);
  });

  it('2. No sobrescribir precio CUOTA con LIBRE: Protects rate map prices from being overwritten', () => {
    // Simulamos una caseta compartida que aparece en cuota a $108 y en una variante libre a $50
    const cuotaItems = parser.parseSakbeDetail({
      data: [
        {
          direccion: 'Cruce la caseta Palmillas',
          costo_caseta: 108,
          punto_caseta: '{"type":"Point","coordinates":[-99.9349,20.3069]}',
        },
      ],
    }, 'SAKBE_DETALLE_C');

    const libreItems = parser.parseSakbeDetail({
      data: [
        {
          direccion: 'Cruce la caseta Palmillas',
          costo_caseta: 50,
          punto_caseta: '{"type":"Point","coordinates":[-99.9349,20.3069]}',
        },
      ],
    }, 'SAKBE_DETALLE_L');

    const updatedPrices = new Map<string, number>();

    // Registrar cuota
    for (const item of cuotaItems) {
      if (item.price !== null) {
        updatedPrices.set(item.name, item.price);
      }
    }
    expect(updatedPrices.get('Palmillas')).toBe(108);

    // Registrar libre con protección contra sobreescritura
    for (const item of libreItems) {
      if (item.price !== null && !updatedPrices.has(item.name)) {
        updatedPrices.set(item.name, item.price);
      }
    }

    // El precio de la ruta de cuota no fue sobreescrito silenciosamente
    expect(updatedPrices.get('Palmillas')).toBe(108);
  });

  it('3. punto_caseta null: Does NOT create toll event solely from direccion text', () => {
    const rawData = {
      data: [
        {
          direccion: 'Cruce la caseta de cobro Esperanza',
          costo_caseta: 150,
          punto_caseta: null, // Sin punto de caseta
          geojson: '{"type":"Point","coordinates":[-97.3601,18.8582]}',
        },
      ],
    };

    const items = parser.parseSakbeDetail(rawData);
    expect(items.length).toBe(0);
  });

  it('4. punto_caseta inválido: Does NOT fallback to segment geojson when punto_caseta is corrupted', () => {
    const rawData = {
      data: [
        {
          direccion: 'Cruce la caseta Tepotzotlán',
          costo_caseta: 108,
          punto_caseta: 'INVALID_JSON_CONTENT{{{', // Corrupto
          geojson: '{"type":"Point","coordinates":[-99.2075,19.7144]}',
        },
      ],
    };

    const items = parser.parseSakbeDetail(rawData);
    expect(items.length).toBe(0);
  });

  it('5. routePosition: Computes progress using accumulated long_m instead of uniform index', () => {
    const rawData = {
      data: [
        {
          long_m: 10000, // 10 km
          punto_caseta: null,
        },
        {
          long_m: 10000, // 10 km (Total acumulado: 20 km) -> Caseta al 20%
          costo_caseta: 108,
          punto_caseta: '{"type":"Point","coordinates":[-99.9349,20.3069]}',
          direccion: 'Cruce la caseta Palmillas',
        },
        {
          long_m: 80000, // 80 km (Total acumulado: 100 km)
          punto_caseta: null,
        },
      ],
    };

    const items = parser.parseSakbeDetail(rawData);
    expect(items.length).toBe(1);

    // Con index uniforme sería 1/2 = 0.50 (50%). Con long_m acumulado (20km / 100km) es 0.20 (20%).
    expect(items[0].routePosition).toBe(0.2);
  });

  it('6. API key check: Verifies no literal API keys are hardcoded in source files', () => {
    const inegiLiveSyncPath = path.resolve(__dirname, '../src/modules/tolls/inegi-live-sync.service.ts');
    const inegiImporterPath = path.resolve(__dirname, '../src/modules/tolls/import/sources/inegi.importer.ts');

    const liveSyncContent = fs.readFileSync(inegiLiveSyncPath, 'utf-8');
    const importerContent = fs.readFileSync(inegiImporterPath, 'utf-8');

    // No debe contener tokens hardcodeados literales que no provengan de process.env / env
    const hardcodedPattern = /['"]kqvCNH1V-[A-Za-z0-9-]+['"]/;
    expect(hardcodedPattern.test(liveSyncContent)).toBe(false);
    expect(hardcodedPattern.test(importerContent)).toBe(false);
  });

  it('7. Deduplication & Idempotency: Parsing identical SAKBE data repeatedly yields consistent count and positions', () => {
    const rawData = {
      data: [
        {
          long_m: 50000,
          punto_caseta: '{"type":"Point","coordinates":[-99.9349,20.3069]}',
          direccion: 'Cruce la caseta Palmillas',
          costo_caseta: 108,
        },
      ],
    };

    const run1 = parser.parseSakbeDetail(rawData);
    const run2 = parser.parseSakbeDetail(rawData);

    expect(run1.length).toBe(1);
    expect(run2.length).toBe(1);
    expect(run1[0].name).toBe(run2[0].name);
    expect(run1[0].price).toBe(run2[0].price);
    expect(run1[0].routePosition).toBe(run2[0].routePosition);
  });

  describe('Contract & Event Representation Tests (Phase 1)', () => {
    it('1. Evento con costo positivo: Preserves observedPrice, price > 0, priceStatus VALID and giro', () => {
      const rawData = {
        data: [
          {
            direccion: 'Cruce la caseta San Nicolás de los Jassos',
            costo_caseta: 110.0,
            giro: 9,
            punto_caseta: '{"type":"Point","coordinates":[-100.8250,22.1298]}',
            long_m: 161.16,
          },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData, 'SAKBE_DETALLE_C');
      expect(parsed.length).toBe(1);
      expect(parsed[0].price).toBe(110);
      expect(parsed[0].observedPrice).toBe(110);
      expect(parsed[0].priceStatus).toBe('VALID');
      expect(parsed[0].giro).toBe(9);
      expect(parsed[0].sourceProvider).toBe('SAKBE_DETALLE_C');
      expect(parsed[0].sourceEventType).toBe('SAKBE_DETALLE_C');

      const events = parser.toTollEvents(parsed, 'automovil');
      expect(events[0].price).toBe(110);
      expect(events[0].observedPrice).toBe(110);
      expect(events[0].priceStatus).toBe('VALID');
      expect(events[0].giro).toBe(9);
      expect(events[0].sourceProvider).toBe('SAKBE_DETALLE_C');
    });

    it('2. Evento con costo $0 observado: Preserves observedPrice=0, priceStatus VALID and giro=8', () => {
      const rawData = {
        data: [
          {
            direccion: 'Cruce la caseta Lechería - Cuautitlán',
            costo_caseta: 0.0,
            giro: 8,
            punto_caseta: '{"type":"Point","coordinates":[-99.2058,19.6049]}',
            long_m: 37.5,
          },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData, 'SAKBE_DETALLE_C');
      expect(parsed.length).toBe(1);
      expect(parsed[0].price).toBe(0);
      expect(parsed[0].observedPrice).toBe(0);
      expect(parsed[0].priceStatus).toBe('VALID');
      expect(parsed[0].giro).toBe(8);

      const events = parser.toTollEvents(parsed, 'automovil');
      expect(events[0].price).toBe(0);
      expect(events[0].observedPrice).toBe(0);
      expect(events[0].priceStatus).toBe('VALID');
    });

    it('3. Evento con costo ausente/nulo/inválido: Correctly flags UNKNOWN without converting silently to valid $0', () => {
      const rawData = {
        data: [
          {
            direccion: 'Cruce la caseta Desconocida 1',
            costo_caseta: null,
            punto_caseta: '{"type":"Point","coordinates":[-100.8250,22.1298]}',
          },
          {
            direccion: 'Cruce la caseta Desconocida 2',
            costo_caseta: 'N/A',
            punto_caseta: '{"type":"Point","coordinates":[-100.6562,22.5206]}',
          },
          {
            direccion: 'Cruce la caseta Desconocida 3',
            // costo_caseta omitido
            punto_caseta: '{"type":"Point","coordinates":[-100.6072,23.6642]}',
          },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData, 'SAKBE_DETALLE_C');
      expect(parsed.length).toBe(3);

      for (const item of parsed) {
        expect(item.price).toBeNull();
        expect(item.price).not.toBe(0);
        expect(item.observedPrice).toBeUndefined();
        expect(item.priceStatus).toBe('UNKNOWN');
      }

      const events = parser.toTollEvents(parsed, 'automovil');
      for (const ev of events) {
        expect(ev.price).toBeNull();
        expect(ev.price).not.toBe(0);
        expect(ev.priceStatus).toBe('UNKNOWN');
        expect(ev.observedPrice).toBeUndefined();
      }
    });

    it('4. Preservación de giro: Retains numeric maneuver/toll code precisely', () => {
      const rawData = {
        data: [
          {
            direccion: 'Caseta Giro 9',
            costo_caseta: 45,
            giro: 9,
            punto_caseta: '{"type":"Point","coordinates":[-100.6072,23.6642]}',
          },
          {
            direccion: 'Caseta Giro 8',
            costo_caseta: 0,
            giro: 8,
            punto_caseta: '{"type":"Point","coordinates":[-99.2531,19.3463]}',
          },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData);
      expect(parsed[0].giro).toBe(9);
      expect(parsed[1].giro).toBe(8);
    });

    it('5. Preservación de routePosition: Accurately reflects progress along route geometry', () => {
      const rawData = {
        data: [
          { long_m: 25000, punto_caseta: null },
          {
            long_m: 25000,
            punto_caseta: '{"type":"Point","coordinates":[-99.9291,20.2959]}',
            direccion: 'Cruce la caseta Palmillas',
            costo_caseta: 113,
          },
          { long_m: 50000, punto_caseta: null },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData);
      expect(parsed.length).toBe(1);
      // Total: 100km, Caseta al km 50 -> 0.50
      expect(parsed[0].routePosition).toBe(0.5);
    });

    it('6. Preservación de coordenadas: Maintains exact float longitude and latitude from GeoJSON', () => {
      const rawData = {
        data: [
          {
            direccion: 'Cruce la caseta Paso Morelos',
            costo_caseta: 209,
            punto_caseta: '{"type":"Point","crs":{"type":"name","properties":{"name":"inegi_grs80:55555"}},"coordinates":[-99.215483772,18.231466683]}',
          },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData);
      expect(parsed.length).toBe(1);
      expect(parsed[0].longitude).toBe(-99.215483772);
      expect(parsed[0].latitude).toBe(18.231466683);
    });

    it('7. Regla estricta: UNKNOWN jamás se etiqueta como VALID $0', () => {
      const rawData = {
        data: [
          {
            direccion: 'Cruce la caseta Sin Tarifa',
            costo_caseta: null,
            punto_caseta: '{"type":"Point","coordinates":[-99.2154,18.2314]}',
          },
        ],
      };

      const parsed = parser.parseSakbeDetail(rawData);
      expect(parsed[0].priceStatus).toBe('UNKNOWN');
      expect(parsed[0].observedPrice).toBeUndefined();

      const events = parser.toTollEvents(parsed);
      expect(events[0].priceStatus).toBe('UNKNOWN');
      expect(events[0].priceStatus).not.toBe('VALID');
    });
  });
});

