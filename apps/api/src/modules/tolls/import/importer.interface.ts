import { VehicleType } from '@routewise/types';

export interface RawTollRecord {
  plazaName: string;
  highwayCode?: string;
  roadName?: string;
  operator?: string;
  latitude: number;
  longitude: number;
  direction?: string;
  kmMarker?: number;
  vehicleType: VehicleType;
  cashPrice: number;
  electronicPrice?: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
  sourceReference?: string;
}

export interface ImportValidationWarning {
  row: number;
  field: string;
  message: string;
  data?: unknown;
}

export interface ImportResult {
  sourceCode: string;
  totalRows: number;
  validRows: number;
  plazasCreated: number;
  plazasUpdated: number;
  ratesCreated: number;
  ratesUpdated: number;
  skipped: number;
  warnings: ImportValidationWarning[];
  errors: string[];
  dryRun: boolean;
}

export interface TollDataImporter {
  readonly sourceCode: string;
  readonly sourceName: string;

  parse(rawContent: string): Promise<RawTollRecord[]>;
  validate(records: RawTollRecord[]): { valid: RawTollRecord[]; warnings: ImportValidationWarning[] };
  import(rawContent: string, options?: { dryRun?: boolean; sourceId?: string }): Promise<ImportResult>;
}
