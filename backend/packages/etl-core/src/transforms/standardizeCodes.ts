/**
 * Transform 4 — standardizeCodes: sex / diagnosis / test / status / payer
 * codes → canonical controlled sets.
 *
 * Complements `correctInvalid` (which neutralizes INVALID values): this step
 * maps legitimate variants (m, Male, female, F) and case differences to the
 * canonical uppercase code sets used by the warehouse and API.
 */
import type { RawRow, RowTransform } from '../types.js';
import { flag } from '../types.js';
import { pick, set, setMany } from './helpers.js';

const SEX_CANON = new Map([
  ['M', 'MALE'], ['MALE', 'MALE'],
  ['F', 'FEMALE'], ['FEMALE', 'FEMALE'],
  ['O', 'OTHER'], ['OTHER', 'OTHER'],
  ['U', 'UNKNOWN'], ['UNKNOWN', 'UNKNOWN'], ['', 'UNKNOWN'],
]);

/** Claim statuses accepted by the app.ClaimStatus enum; anything else → PENDING + flag. */
const CLAIM_STATUSES = new Set(['DRAFT', 'SUBMITTED', 'PENDING', 'PAID', 'DENIED', 'APPEALED']);

/** LIS result status codes (HL7-obr-style) → canonical result status text. */
const RESULT_STATUS_MAP = new Map([
  ['F', 'RELEASED'],
  ['C', 'CORRECTED'],
  ['P', 'IN_PROGRESS'],
  ['I', 'IN_PROGRESS'],
  ['R', 'REVIEWED'],
  ['', 'COLLECTED'],
]);

function standardizePatient(row: RawRow): RawRow {
  let out = row;
  const sex = String(pick(out.payload, 'sex', 'gender') ?? '').trim().toUpperCase();
  out = set(out, 'sex', SEX_CANON.get(sex) ?? 'UNKNOWN');
  const city = pick(out.payload, 'city');
  if (typeof city === 'string' && city.trim()) {
    // Title-case city: 'MANILA' → 'Manila', 'quezon city' → 'Quezon City'.
    const title = city
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    out = set(out, 'city', title);
  }
  return out;
}

function standardizeLabResult(row: RawRow): RawRow {
  let out = row;
  const testCode = String(pick(out.payload, 'test_code', 'testCode') ?? '').trim().toUpperCase();
  out = set(out, 'test_code', testCode);
  const rawStatus = String(pick(out.payload, 'result_status', 'status') ?? '').trim().toUpperCase();
  out = set(out, 'result_status', RESULT_STATUS_MAP.get(rawStatus) ?? 'RELEASED');
  return out;
}

function standardizeClaim(row: RawRow): RawRow {
  let out = row;
  const status = String(pick(out.payload, 'status') ?? '').trim().toUpperCase();
  if (CLAIM_STATUSES.has(status)) {
    out = set(out, 'status', status);
  } else {
    out = set(out, 'status', 'PENDING');
    out = flag(out, `CLAIM_STATUS_INVALID:${status || 'blank'}`);
  }
  const payer = String(pick(out.payload, 'payer_code', 'payerCode') ?? '').trim().toUpperCase();
  out = set(out, 'payer_code', payer);
  return out;
}

function standardizeEncounter(row: RawRow): RawRow {
  let out = row;
  const code = String(pick(out.payload, 'diagnosis_code', 'diagnosisCode') ?? '').trim().toUpperCase();
  const text = String(pick(out.payload, 'diagnosis_text', 'diagnosisText') ?? '').trim();
  out = setMany(out, { diagnosis_code: code, diagnosis_text: text });
  return out;
}

export const standardizeCodes: RowTransform = (rows: RawRow[]): RawRow[] =>
  rows.map((row) => {
    switch (row.recordType) {
      case 'patient':
        return standardizePatient(row);
      case 'lab_result':
        return standardizeLabResult(row);
      case 'claim':
        return standardizeClaim(row);
      case 'encounter':
        return standardizeEncounter(row);
      default:
        return row;
    }
  });
