/**
 * Legacy connector — the deliberately MESSY registry export
 * (fixtures/legacy/patients_legacy.csv): mixed date formats (MM/DD/YYYY,
 * DD/MM/YYYY, ISO), inconsistent name casing / double spaces, duplicate rows,
 * invalid sex codes (X, M?), and blank DOBs. Kept as raw strings on purpose —
 * the transform chain cleans it.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import type { Connector, RawRow } from '../types.js';
import { defaultFixturesDir } from '../paths.js';

interface LegacyCsvRow {
  patient_id?: string;
  full_name?: string;
  dob?: string;
  sex?: string;
  city?: string;
}

export function legacyConnector(fixturesDir?: string): Connector {
  const dir = fixturesDir ?? defaultFixturesDir();
  const filePath = path.join(dir, 'legacy', 'patients_legacy.csv');
  return {
    name: 'legacy-patients',
    sourceSystem: 'LEGACY',
    async *extract(): AsyncIterable<RawRow> {
      const raw = await readFile(filePath, 'utf8');
      const records = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: false,
      }) as LegacyCsvRow[];
      for (const rec of records) {
        const sourceRecordId = String(rec.patient_id ?? '').trim();
        if (!sourceRecordId) continue;
        yield {
          sourceSystem: 'LEGACY',
          recordType: 'patient',
          sourceRecordId,
          // Deliberately untrimmed — the transform chain must fix casing,
          // whitespace and date formats itself.
          payload: {
            patient_id: rec.patient_id,
            full_name: rec.full_name,
            dob: rec.dob,
            sex: rec.sex,
            city: rec.city,
          },
        };
      }
    },
  };
}
