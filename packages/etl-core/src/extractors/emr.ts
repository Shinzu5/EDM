/** EMR connector — clean JSON export of patients (fixtures/emr/patients.json). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connector, RawRow } from '../types.js';
import { defaultFixturesDir } from '../paths.js';

interface EmrPatient {
  emr_patient_id?: string;
  mrn?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
  sex?: string;
  phone?: string | null;
  city?: string;
}

export function emrConnector(fixturesDir?: string): Connector {
  const dir = fixturesDir ?? defaultFixturesDir();
  const filePath = path.join(dir, 'emr', 'patients.json');
  return {
    name: 'emr-patients',
    sourceSystem: 'EMR',
    async *extract(): AsyncIterable<RawRow> {
      const raw = await readFile(filePath, 'utf8');
      const items = JSON.parse(raw) as EmrPatient[];
      for (const item of items) {
        const sourceRecordId = String(item.emr_patient_id ?? item.mrn ?? '');
        if (!sourceRecordId) continue;
        yield {
          sourceSystem: 'EMR',
          recordType: 'patient',
          sourceRecordId,
          payload: { ...item },
        };
      }
    },
  };
}
