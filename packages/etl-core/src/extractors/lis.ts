/** LIS connector — HL7-derived lab results (fixtures/lis/results.json). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connector, RawRow } from '../types.js';
import { defaultFixturesDir } from '../paths.js';

interface LisResult {
  lis_order_id?: string;
  emr_mrn?: string;
  test_code?: string;
  test_name?: string;
  ordered_at?: string;
  value?: number | string | null;
  unit?: string;
  reference_range?: string;
  result_status?: string;
}

export function lisConnector(fixturesDir?: string): Connector {
  const dir = fixturesDir ?? defaultFixturesDir();
  const filePath = path.join(dir, 'lis', 'results.json');
  return {
    name: 'lis-results',
    sourceSystem: 'LIS',
    async *extract(): AsyncIterable<RawRow> {
      const raw = await readFile(filePath, 'utf8');
      const items = JSON.parse(raw) as LisResult[];
      for (const item of items) {
        const sourceRecordId = String(item.lis_order_id ?? '');
        if (!sourceRecordId) continue;
        yield {
          sourceSystem: 'LIS',
          recordType: 'lab_result',
          sourceRecordId,
          payload: { ...item },
        };
      }
    },
  };
}
