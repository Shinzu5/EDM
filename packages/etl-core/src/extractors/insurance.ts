/** Insurance connector — policy/eligibility feed (fixtures/insurance/policies.json). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connector, RawRow } from '../types.js';
import { defaultFixturesDir } from '../paths.js';

interface PolicyRecord {
  policy_number?: string;
  mrn?: string;
  payer_code?: string;
  member_number?: string;
  effective_date?: string;
  terminated_date?: string | null;
  status?: string;
}

export function insuranceConnector(fixturesDir?: string): Connector {
  const dir = fixturesDir ?? defaultFixturesDir();
  const filePath = path.join(dir, 'insurance', 'policies.json');
  return {
    name: 'insurance-policies',
    sourceSystem: 'INSURANCE',
    async *extract(): AsyncIterable<RawRow> {
      const raw = await readFile(filePath, 'utf8');
      const items = JSON.parse(raw) as PolicyRecord[];
      for (const item of items) {
        const sourceRecordId = String(item.policy_number ?? '');
        if (!sourceRecordId) continue;
        yield {
          sourceSystem: 'INSURANCE',
          recordType: 'insurance_policy',
          sourceRecordId,
          payload: { ...item },
        };
      }
    },
  };
}
