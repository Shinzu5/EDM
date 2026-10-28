/**
 * Transform 7 — businessRules: enforce domain rules, drop violating rows.
 *
 *  - outpatient encounters may have LOS <= 0 (same-day visits) — allowed
 *  - inpatient encounters MUST have a discharge timestamp
 *  - a lab result with a numeric value MUST carry a unit
 *  - a claim's paid amount must never exceed the billed amount
 *  - patient rows must resolve to a name
 *
 * Rows that violate a HARD rule are removed from the output (they are exactly
 * the rows the DQ rules flag downstream — poor integration must not silently
 * propagate). Row order is preserved.
 */
import type { RawRow, RowTransform } from '../types.js';
import { pick } from './helpers.js';

/** Returns the list of hard-rule violations for a row (empty = valid). */
export function violationsOf(row: RawRow): string[] {
  const p = row.payload;
  const v: string[] = [];
  switch (row.recordType) {
    case 'encounter': {
      const type = String(pick(p, 'type', 'encounter_type', 'encounterType') ?? '').toUpperCase();
      const discharged = pick(p, 'discharged_at', 'dischargedAt');
      if (type === 'INPATIENT' && !discharged) v.push('INPATIENT_MISSING_DISCHARGE');
      break;
    }
    case 'lab_result': {
      const hasNumeric = typeof p.valueNumeric === 'number' && Number.isFinite(p.valueNumeric);
      const unit = pick(p, 'unit');
      if (hasNumeric && !(typeof unit === 'string' && unit.trim())) v.push('RESULT_MISSING_UNIT');
      break;
    }
    case 'claim': {
      const billed = typeof p.billed_amount === 'number' ? p.billed_amount : null;
      const paid = typeof p.paid_amount === 'number' ? p.paid_amount : null;
      if (paid !== null && billed !== null && paid > billed) v.push('CLAIM_PAID_EXCEEDS_BILLED');
      if ((billed !== null && billed < 0) || (paid !== null && paid < 0)) v.push('CLAIM_AMOUNT_NEGATIVE');
      break;
    }
    case 'patient': {
      const first = pick(p, 'first_name', 'firstName');
      const last = pick(p, 'last_name', 'lastName');
      if (!first && !last) v.push('PATIENT_NAME_MISSING');
      break;
    }
    default:
      break;
  }
  return v;
}

export const businessRules: RowTransform = (rows: RawRow[]): RawRow[] =>
  rows.filter((row) => violationsOf(row).length === 0);
