/** Billing connector — payer claim feed (fixtures/billing/claims.csv, csv-parse). */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import type { Connector, RawRow } from '../types.js';
import { defaultFixturesDir } from '../paths.js';

interface BillingCsvRow {
  claim_number?: string;
  mrn?: string;
  payer_code?: string;
  billed_amount?: string;
  paid_amount?: string;
  status?: string;
  submitted_at?: string;
  source_updated_at?: string;
}

export function billingConnector(fixturesDir?: string): Connector {
  const dir = fixturesDir ?? defaultFixturesDir();
  const filePath = path.join(dir, 'billing', 'claims.csv');
  return {
    name: 'billing-claims',
    sourceSystem: 'BILLING',
    async *extract(): AsyncIterable<RawRow> {
      const raw = await readFile(filePath, 'utf8');
      const records = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as BillingCsvRow[];
      for (const rec of records) {
        const sourceRecordId = String(rec.claim_number ?? '');
        if (!sourceRecordId) continue;
        const num = (v: string | undefined): number | null => {
          if (v === undefined || v === '') return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        yield {
          sourceSystem: 'BILLING',
          recordType: 'claim',
          sourceRecordId,
          payload: {
            claim_number: rec.claim_number,
            mrn: rec.mrn,
            payer_code: rec.payer_code,
            billed_amount: num(rec.billed_amount),
            paid_amount: num(rec.paid_amount),
            status: rec.status,
            submitted_at: rec.submitted_at ?? null,
            source_updated_at: rec.source_updated_at ?? null,
          },
        };
      }
    },
  };
}
