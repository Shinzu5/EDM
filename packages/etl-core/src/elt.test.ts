import { describe, expect, it } from 'vitest';
import { EXPECTED_MATERIALIZED_VIEWS, EXPECTED_VIEWS, splitSqlStatements } from './elt.js';
import { fallbackGoldenId, dateKeyOf } from './warehouse-loader.js';

describe('elt — SQL asset handling', () => {
  it('splits a script into statements, ignoring semicolons inside strings and comments', () => {
    const sql = `
      -- comment with ; inside
      SELECT 'a;b' AS x;
      CREATE VIEW v AS SELECT 1 AS n /* block-ish line comment marker */;
      SELECT 2
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("'a;b'");
    expect(statements[2]).toBe('SELECT 2');
  });

  it('declares the expected warehouse SQL assets', () => {
    expect(EXPECTED_MATERIALIZED_VIEWS).toEqual([
      'warehouse.mv_patient_rollup',
      'warehouse.mv_lab_tat_monthly',
      'warehouse.mv_claim_payment_lag',
    ]);
    expect(EXPECTED_VIEWS).toContain('gov.patient_360');
  });
});

describe('warehouse-loader helpers', () => {
  it('dateKeyOf renders YYYYMMDD in UTC', () => {
    expect(dateKeyOf(new Date('2024-03-14T23:59:59.999Z'))).toBe(20240314);
    expect(dateKeyOf(new Date('2024-12-01T00:00:00.000Z'))).toBe(20241201);
  });

  it('fallbackGoldenId is stable per person and distinct across people', () => {
    const a = fallbackGoldenId('JUAN DELA CRUZ', '1985-03-14');
    expect(a).toBe(fallbackGoldenId('juan  dela cruz', '1985-03-14'));
    expect(a).not.toBe(fallbackGoldenId('MARIA SANTOS', '1985-03-14'));
    expect(a).not.toBe(fallbackGoldenId('JUAN DELA CRUZ', '1990-01-01'));
  });
});
