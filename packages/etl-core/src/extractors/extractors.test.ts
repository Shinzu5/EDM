import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  allConnectors,
  billingConnector,
  defaultFixturesDir,
  emrConnector,
  getConnector,
  insuranceConnector,
  legacyConnector,
  lisConnector,
} from './index.js';

async function collect(connector: { extract(): AsyncIterable<unknown> }): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const row of connector.extract()) out.push(row);
  return out;
}

describe('extractors', () => {
  it('emr connector streams patient rows from fixtures/emr/patients.json', async () => {
    const rows = (await collect(emrConnector())) as Array<{ recordType: string; sourceSystem: string; payload: Record<string, unknown> }>;
    expect(rows.length).toBeGreaterThanOrEqual(13); // 10 random + the Juan trio
    expect(rows.every((r) => r.recordType === 'patient' && r.sourceSystem === 'EMR')).toBe(true);
    expect(rows.some((r) => r.payload.mrn === 'MRN-900001')).toBe(true);
  });

  it('lis connector streams lab_result rows', async () => {
    const rows = (await collect(lisConnector())) as Array<{ recordType: string; payload: Record<string, unknown> }>;
    expect(rows).toHaveLength(12);
    expect(rows[0]!.recordType).toBe('lab_result');
    expect(rows[0]!.payload.lis_order_id).toBe('LIS-300000');
  });

  it('billing connector parses claims.csv with csv-parse and numeric amounts', async () => {
    const rows = (await collect(billingConnector())) as Array<{
      sourceRecordId: string;
      payload: Record<string, unknown>;
    }>;
    expect(rows).toHaveLength(10);
    expect(rows[0]!.sourceRecordId).toBe('CLM-2024-900000');
    expect(typeof rows[0]!.payload.billed_amount).toBe('number');
    expect(rows[0]!.payload.billed_amount).toBe(1250);
    expect(rows[0]!.payload.status).toBe('PAID');
  });

  it('insurance connector streams policy rows', async () => {
    const rows = (await collect(insuranceConnector())) as Array<{ recordType: string; payload: Record<string, unknown> }>;
    expect(rows).toHaveLength(8);
    expect(rows[0]!.recordType).toBe('insurance_policy');
    expect(rows[0]!.payload.policy_number).toBe('POL-700000');
  });

  it('legacy connector preserves the mess (raw strings, mixed date formats)', async () => {
    const rows = (await collect(legacyConnector())) as Array<{ payload: Record<string, unknown> }>;
    expect(rows).toHaveLength(12);
    expect(rows[0]!.payload.dob).toBe('03/14/1985');
    expect(rows[0]!.payload.full_name).toBe('JUAN DELA CRUZ');
    expect(rows[5]!.payload.dob).toBe(''); // blank DOB survives extraction on purpose
  });

  it('registry exposes all five connectors', () => {
    expect(allConnectors().map((c) => c.name)).toEqual([
      'emr-patients',
      'lis-results',
      'billing-claims',
      'insurance-policies',
      'legacy-patients',
    ]);
    expect(getConnector('billing').sourceSystem).toBe('BILLING');
    expect(() => getConnector('nope' as never)).toThrow(/Unknown connector/);
  });

  it('defaultFixturesDir points at the repo fixtures folder', async () => {
    const file = path.join(defaultFixturesDir(), 'legacy', 'patients_legacy.csv');
    const content = await readFile(file, 'utf8');
    expect(content).toContain('L-001');
  });
});
