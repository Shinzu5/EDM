/**
 * Transform 2 — correctInvalid: repair or neutralize invalid field values.
 *
 * Legacy feeds carry invalid sex codes ('X', 'M?') and blank DOBs. Invalid sex
 * → UNKNOWN (kept as a valid controlled value); blank/unparseable DOB → null.
 * Every correction is flagged on the row (`_flags`) for DQ observability.
 */
import type { RawRow, RowTransform } from '../types.js';
import { flag } from '../types.js';
import { nameTokens, parseLooseDate, pick, set, setMany } from './helpers.js';

const SEX_ALIASES = new Map([
  ['M', 'MALE'],
  ['MALE', 'MALE'],
  ['F', 'FEMALE'],
  ['FEMALE', 'FEMALE'],
  ['O', 'OTHER'],
  ['OTHER', 'OTHER'],
  ['U', 'UNKNOWN'],
  ['UNKNOWN', 'UNKNOWN'],
]);

/** Canonical sex or 'UNKNOWN' when the raw code is invalid. */
export function correctSex(raw: unknown): { sex: string; invalid: boolean } {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return { sex: 'UNKNOWN', invalid: true };
  const mapped = SEX_ALIASES.get(s);
  if (mapped) return { sex: mapped, invalid: false };
  return { sex: 'UNKNOWN', invalid: true };
}

/** Split a messy full name into first/last (drops punctuation, collapses spaces).
 *  'Juan Dela Cruz' → { Juan | Dela Cruz } — Filipino particle convention. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const tokens = nameTokens(fullName);
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  if (tokens.length === 1) return { firstName: tokens[0]!, lastName: '' };
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(' ') };
}

function correctPatient(row: RawRow): RawRow {
  let out = row;
  const p = row.payload;

  // Sex: invalid codes → UNKNOWN + flag.
  const { sex, invalid } = correctSex(pick(p, 'sex', 'gender'));
  out = set(out, 'sex', sex);
  if (invalid) out = flag(out, 'SEX_INVALID');

  // DOB: blank/unparseable → null + flag.
  const rawDob = pick(p, 'dob', 'dateOfBirth');
  const dob = parseLooseDate(rawDob).value;
  out = set(out, 'dob', dob);
  if (!dob) out = flag(out, 'DOB_MISSING');

  // Name: legacy rows have a single full_name; split it for uniformity.
  const full = pick(p, 'full_name', 'fullName');
  if (full !== undefined) {
    const { firstName, lastName } = splitFullName(String(full));
    out = setMany(out, { first_name: firstName, last_name: lastName });
  }
  const first = String(pick(out.payload, 'first_name', 'firstName') ?? '').trim();
  const last = String(pick(out.payload, 'last_name', 'lastName') ?? '').trim();
  if (!first && !last) out = flag(out, 'NAME_MISSING');
  return out;
}

function correctLabResult(row: RawRow): RawRow {
  let out = row;
  const value = pick(row.payload, 'value', 'valueNumeric', 'value_numeric');
  const numeric = typeof value === 'number' ? value : Number(value);
  if (value !== null && value !== undefined && value !== '' && Number.isFinite(numeric)) {
    out = set(out, 'valueNumeric', numeric);
  } else {
    out = set(out, 'valueNumeric', null);
    out = flag(out, 'VALUE_MISSING');
  }
  return out;
}

function correctClaim(row: RawRow): RawRow {
  let out = row;
  const billed = pick(row.payload, 'billed_amount', 'billedAmount');
  const paid = pick(row.payload, 'paid_amount', 'paidAmount');
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const billedNum = toNum(billed);
  const paidNum = toNum(paid);
  out = set(out, 'billed_amount', billedNum);
  out = set(out, 'paid_amount', paidNum);
  if (billedNum === null) out = flag(out, 'BILLED_AMOUNT_MISSING');
  return out;
}

export const correctInvalid: RowTransform = (rows: RawRow[]): RawRow[] =>
  rows.map((row) => {
    switch (row.recordType) {
      case 'patient':
        return correctPatient(row);
      case 'lab_result':
        return correctLabResult(row);
      case 'claim':
        return correctClaim(row);
      default:
        return row;
    }
  });
