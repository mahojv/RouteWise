import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CapufeCsvImporter } from '../src/modules/tolls/import/sources/capufe.importer';
import {
  normalizeHighway,
  normalizePlazaName,
  normalizeVehicleType,
  isWithinMexicoBounds,
} from '../src/modules/tolls/import/normalizer';

describe('CAPUFE Importer & Normalization Unit Tests', () => {
  const importer = new CapufeCsvImporter();

  it('Normalizes highway names properly', () => {
    expect(normalizeHighway('MEX-57D')).toBe('MEX-057D');
    expect(normalizeHighway('57D')).toBe('MEX-057D');
    expect(normalizeHighway('MEX 45D')).toBe('MEX-045D');
    expect(normalizeHighway('CARRETERA 150D')).toBe('MEX-150D');
    expect(normalizeHighway(undefined)).toBeUndefined();
  });

  it('Normalizes plaza names by trimming and stripping prefixes', () => {
    expect(normalizePlazaName('Caseta de Cobro Palmillas')).toBe('Palmillas');
    expect(normalizePlazaName('  Caseta  Tepotzotlán  ')).toBe('Tepotzotlán');
  });

  it('Normalizes vehicle types to canonical categories', () => {
    expect(normalizeVehicleType('Automóvil')).toBe('automovil');
    expect(normalizeVehicleType('auto')).toBe('automovil');
    expect(normalizeVehicleType('Motocicleta')).toBe('motocicleta');
    expect(normalizeVehicleType('Autobús 2 ejes')).toBe('autobus');
    expect(normalizeVehicleType('Camión 3 ejes')).toBe('camion_2_ejes');
  });

  it('Accurately validates Mexico geographical bounds', () => {
    // Querétaro
    expect(isWithinMexicoBounds(20.5888, -100.3899)).toBe(true);
    // CDMX
    expect(isWithinMexicoBounds(19.4326, -99.1332)).toBe(true);
    // Madrid, Spain (Outside)
    expect(isWithinMexicoBounds(40.4168, -3.7038)).toBe(false);
    // Tokyo, Japan (Outside)
    expect(isWithinMexicoBounds(35.6762, 139.6503)).toBe(false);
  });

  it('Parses and dry-runs valid CAPUFE sample CSV fixture', async () => {
    const sampleCsvPath = path.resolve(__dirname, '../src/fixtures/import/capufe-sample.csv');
    const content = fs.readFileSync(sampleCsvPath, 'utf-8');

    const raw = await importer.parse(content);
    expect(raw.length).toBeGreaterThanOrEqual(6);

    const { valid, warnings } = importer.validate(raw);
    expect(valid.length).toBe(raw.length);
    expect(warnings.length).toBe(0);

    const dryRunResult = await importer.import(content, { dryRun: true });
    expect(dryRunResult.dryRun).toBe(true);
    expect(dryRunResult.totalRows).toBe(raw.length);
    expect(dryRunResult.validRows).toBe(valid.length);
    expect(dryRunResult.errors.length).toBe(0);
  });

  it('Detects invalid rows (coordinates outside Mexico, negative price, empty name)', async () => {
    const invalidCsvPath = path.resolve(__dirname, '../src/fixtures/import/capufe-invalid.csv');
    const content = fs.readFileSync(invalidCsvPath, 'utf-8');

    const raw = await importer.parse(content);
    const { valid, warnings } = importer.validate(raw);

    expect(warnings.length).toBeGreaterThanOrEqual(4);
    // All 4 rows in capufe-invalid.csv are malformed
    expect(valid.length).toBe(0);
  });
});
