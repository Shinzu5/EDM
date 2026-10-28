import { describe, expect, it } from 'vitest';
import type { RawRow } from '../types.js';
import {
  businessRules,
  calculateValues,
  combineSources,
  convertDates,
  correctInvalid,
  deduplicate,
  dedupeKey,
  standardizeCodes,
  violationsOf,
  applyTransforms,
  DEFAULT_TRANSFORMS,
} from './index.js';

function patientRow(id: string, payload: Record<string, unknown>, source: RawRow['sourceSystem'] = 'LEGACY'): RawRow {
  return { sourceSystem: source, recordType: 'patient', sourceRecordId: id, payload };
}

describe('transform 1 — deduplicate', () => {
  const rows: RawRow[] = [
    patientRow('L-001', { patient_id: 'L-001', full_name: 'JUAN DELA CRUZ', dob: '03/14/1985', city: 'Manila' }),
    patientRow('L-002', { patient_id: 'L-002', full_name: 'juan dela cruz', dob: '1985-03-14', city: 'MANILA' }),
    patientRow('L-003', { patient_id: 'L-003', full_name: 'Juan D. Cruz', dob: '14/03/1985', city: 'Manila' }),
  ];

  it('removes content duplicates across formats but keeps distinct variants', () => {
    const out = deduplicate(rows);
    expect(out.map((r) => r.sourceRecordId)).toEqual(['L-001', 'L-003']);
  });

  it('dedupeKey is format-insensitive on dates and casing', () => {
    expect(dedupeKey(rows[0]!)).toBe(dedupeKey(rows[1]!));
    expect(dedupeKey(rows[2]!)).not.toBe(dedupeKey(rows[0]!));
  });

  it('dedupes claims by claim number regardless of case/whitespace', () => {
    const claims: RawRow[] = [
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C1', payload: { claim_number: 'CLM-1' } },
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C2', payload: { claim_number: ' clm-1 ' } },
    ];
    expect(deduplicate(claims)).toHaveLength(1);
  });
});

describe('transform 2 — correctInvalid', () => {
  it('maps invalid sex codes to UNKNOWN and flags them', () => {
    const out = correctInvalid([
      patientRow('1', { full_name: 'Jose Reyes', dob: '', sex: 'X' }),
    ])[0]!;
    expect(out.payload.sex).toBe('UNKNOWN');
    expect(out.payload.dob).toBeNull();
    expect(out.payload._flags).toEqual(expect.arrayContaining(['SEX_INVALID', 'DOB_MISSING']));
  });

  it('normalizes valid sex aliases without flagging', () => {
    const out = correctInvalid([patientRow('1', { full_name: 'Ana B', dob: '1990-07-23', sex: 'female' })])[0]!;
    expect(out.payload.sex).toBe('FEMALE');
    expect(out.payload._flags).toBeUndefined();
  });

  it('splits a messy full_name into first_name / last_name', () => {
    const out = correctInvalid([patientRow('1', { full_name: 'MARIA  SANTOS', dob: '11/02/1978', sex: 'F' })])[0]!;
    expect(out.payload.first_name).toBe('MARIA');
    expect(out.payload.last_name).toBe('SANTOS');
  });

  it('flags missing lab values', () => {
    const out = correctInvalid([
      { sourceSystem: 'LIS', recordType: 'lab_result', sourceRecordId: 'R1', payload: { value: '' } },
    ])[0]!;
    expect(out.payload.valueNumeric).toBeNull();
    expect(out.payload._flags).toEqual(expect.arrayContaining(['VALUE_MISSING']));
  });
});

describe('transform 3 — convertDates', () => {
  const conv = (payload: Record<string, unknown>): Record<string, unknown> =>
    convertDates([patientRow('1', payload)])[0]!.payload;

  it('converts MM/DD/YYYY and DD/MM/YYYY to the same ISO date', () => {
    expect(conv({ full_name: 'A B', dob: '03/14/1985' }).dob).toBe('1985-03-14');
    expect(conv({ full_name: 'A B', dob: '14/03/1985' }).dob).toBe('1985-03-14');
  });

  it('converts M/D/YYYY without zero padding', () => {
    expect(conv({ full_name: 'A B', dob: '7/23/1990' }).dob).toBe('1990-07-23');
  });

  it('keeps ISO datetimes as full ISO and blanks as null', () => {
    const out = convertDates([
      {
        sourceSystem: 'BILLING',
        recordType: 'claim',
        sourceRecordId: 'C1',
        payload: { submitted_at: '2024-01-10T08:30:00.000Z', source_updated_at: '' },
      },
    ])[0]!;
    expect(out.payload.submitted_at).toBe('2024-01-10T08:30:00.000Z');
    expect(out.payload.source_updated_at).toBeNull();
  });

  it('flags unparseable dates as null', () => {
    const out = conv({ full_name: 'A B', dob: 'not-a-date' });
    expect(out.dob).toBeNull();
  });
});

describe('transform 4 — standardizeCodes', () => {
  it('canonicalizes sex, claim status, payer and test codes', () => {
    const out = standardizeCodes([
      patientRow('1', { full_name: 'A B', dob: '1990-01-01', sex: 'f', city: 'MANILA' }),
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C1', payload: { status: 'paid', payer_code: 'maxicare' } },
      { sourceSystem: 'LIS', recordType: 'lab_result', sourceRecordId: 'R1', payload: { test_code: 'glu', result_status: 'F' } },
    ]);
    expect(out[0]!.payload.sex).toBe('FEMALE');
    expect(out[0]!.payload.city).toBe('Manila');
    expect(out[1]!.payload.status).toBe('PAID');
    expect(out[1]!.payload.payer_code).toBe('MAXICARE');
    expect(out[2]!.payload.test_code).toBe('GLU');
    expect(out[2]!.payload.result_status).toBe('RELEASED');
  });

  it('downgrades unknown claim statuses to PENDING and flags them', () => {
    const out = standardizeCodes([
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C1', payload: { status: 'WEIRD' } },
    ])[0]!;
    expect(out.payload.status).toBe('PENDING');
    expect(out.payload._flags).toEqual(expect.arrayContaining(['CLAIM_STATUS_INVALID:WEIRD']));
  });
});

describe('transform 5 — calculateValues', () => {
  it('computes LOS days for encounters', () => {
    const out = calculateValues([
      {
        sourceSystem: 'EMR',
        recordType: 'encounter',
        sourceRecordId: 'E1',
        payload: { admitted_at: '2024-05-01T10:00:00.000Z', discharged_at: '2024-05-03T10:00:00.000Z' },
      },
    ])[0]!;
    expect(out.payload.losDays).toBe(2);
  });

  it('computes claim total and payer update lag hours', () => {
    const out = calculateValues([
      {
        sourceSystem: 'BILLING',
        recordType: 'claim',
        sourceRecordId: 'C1',
        payload: {
          billed_amount: 1250,
          paid_amount: 1000,
          submitted_at: '2024-01-10T00:00:00.000Z',
          source_updated_at: '2024-01-13T00:00:00.000Z',
        },
      },
    ])[0]!;
    expect(out.payload.claimTotal).toBe(1250);
    expect(out.payload.paymentLagHours).toBe(72);
  });

  it('computes lab TAT hours and derives the abnormal flag from the range', () => {
    const out = calculateValues([
      {
        sourceSystem: 'LIS',
        recordType: 'lab_result',
        sourceRecordId: 'R1',
        payload: {
          ordered_at: '2024-05-14T08:30:00.000Z',
          resulted_at: '2024-05-14T14:30:00.000Z',
          valueNumeric: 130,
          reference_range: '70-110',
        },
      },
    ])[0]!;
    expect(out.payload.tatHours).toBe(6);
    expect(out.payload.abnormal_flag).toBe('H');
  });
});

describe('transform 6 — combineSources', () => {
  it('merges EMR + LIS + Billing + Insurance rows for the same patient', () => {
    const combined = combineSources([
      patientRow('P1', { mrn: 'MRN-1', first_name: 'Juan', last_name: 'Dela Cruz', dob: '1985-03-14' }, 'EMR'),
      { sourceSystem: 'LIS', recordType: 'lab_result', sourceRecordId: 'L1', payload: { emr_mrn: 'MRN-1' } },
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C1', payload: { mrn: 'MRN-1' } },
      { sourceSystem: 'INSURANCE', recordType: 'insurance_policy', sourceRecordId: 'POL1', payload: { mrn: 'MRN-1' } },
      patientRow('P2', { mrn: 'MRN-2', first_name: 'Maria', last_name: 'Santos', dob: '1978-11-02' }, 'EMR'),
    ]);
    expect(combined).toHaveLength(2);
    const juan = combined.find((r) => r.sourceRecordId === 'MRN-1')!;
    expect(juan.recordType).toBe('patient_360');
    expect(juan.payload.sources).toEqual(['BILLING', 'EMR', 'INSURANCE', 'LIS']);
    expect(juan.payload.labResultIds).toEqual(['L1']);
    expect(juan.payload.claimIds).toEqual(['C1']);
    expect(juan.payload.policyIds).toEqual(['POL1']);
  });
});

describe('transform 7 — businessRules', () => {
  it('drops inpatient encounters without a discharge timestamp but keeps same-day outpatient', () => {
    const rows: RawRow[] = [
      { sourceSystem: 'EMR', recordType: 'encounter', sourceRecordId: 'E1', payload: { type: 'INPATIENT' } },
      { sourceSystem: 'EMR', recordType: 'encounter', sourceRecordId: 'E2', payload: { type: 'OUTPATIENT', discharged_at: null } },
    ];
    expect(violationsOf(rows[0]!)).toEqual(['INPATIENT_MISSING_DISCHARGE']);
    expect(violationsOf(rows[1]!)).toEqual([]);
    expect(businessRules(rows).map((r) => r.sourceRecordId)).toEqual(['E2']);
  });

  it('drops numeric lab results without a unit', () => {
    const rows: RawRow[] = [
      { sourceSystem: 'LIS', recordType: 'lab_result', sourceRecordId: 'R1', payload: { valueNumeric: 96 } },
      { sourceSystem: 'LIS', recordType: 'lab_result', sourceRecordId: 'R2', payload: { valueNumeric: 96, unit: 'mg/dL' } },
    ];
    expect(businessRules(rows).map((r) => r.sourceRecordId)).toEqual(['R2']);
  });

  it('drops claims where paid exceeds billed or amounts are negative', () => {
    const rows: RawRow[] = [
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C1', payload: { billed_amount: 100, paid_amount: 200 } },
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C2', payload: { billed_amount: -5, paid_amount: null } },
      { sourceSystem: 'BILLING', recordType: 'claim', sourceRecordId: 'C3', payload: { billed_amount: 100, paid_amount: 80 } },
    ];
    expect(businessRules(rows).map((r) => r.sourceRecordId)).toEqual(['C3']);
  });
});

describe('default chain — messy fixture row in, clean row out', () => {
  it('cleans the deliberately messy legacy rows end-to-end', () => {
    const legacy: RawRow[] = [
      patientRow('L-001', { patient_id: 'L-001', full_name: 'JUAN DELA CRUZ', dob: '03/14/1985', sex: 'M', city: 'Manila' }),
      patientRow('L-002', { patient_id: 'L-002', full_name: 'juan dela cruz', dob: '1985-03-14', sex: 'M', city: 'MANILA' }),
      patientRow('L-003', { patient_id: 'L-003', full_name: 'Juan D. Cruz', dob: '14/03/1985', sex: 'm', city: 'Manila' }),
      patientRow('L-006', { patient_id: 'L-006', full_name: 'jose reyes', dob: '', sex: 'X', city: 'Cebu City' }),
      patientRow('L-007', { patient_id: 'L-007', full_name: 'Ana Bautista', dob: '1990-07-23', sex: '', city: 'Davao City' }),
      patientRow('L-008', { patient_id: 'L-008', full_name: 'ana bautista', dob: '7/23/1990', sex: 'female', city: 'Davao City' }),
    ];
    const out = applyTransforms(legacy, DEFAULT_TRANSFORMS.map((t) => t.apply));
    // L-002 and L-008 are content duplicates → removed.
    expect(out.map((r) => r.sourceRecordId)).toEqual(['L-001', 'L-003', 'L-006', 'L-007']);

    const juan = out.find((r) => r.sourceRecordId === 'L-001')!;
    expect(juan.payload.dob).toBe('1985-03-14');
    expect(juan.payload.sex).toBe('MALE');
    expect(juan.payload.first_name).toBe('JUAN');

    const jose = out.find((r) => r.sourceRecordId === 'L-006')!;
    expect(jose.payload.dob).toBeNull();
    expect(jose.payload.sex).toBe('UNKNOWN');
    expect(jose.payload._flags).toEqual(expect.arrayContaining(['SEX_INVALID', 'DOB_MISSING']));
  });
});
