/**
 * Transform 1 — deduplicate: remove duplicate records.
 *
 * Two duplicate classes are handled:
 *  1. Exact re-lands of the same natural source id (keeps the first row).
 *  2. Content duplicates across formats (legacy registry rows that describe the
 *     same person under a different id: 'JUAN DELA CRUZ,03/14/1985' vs
 *     'juan dela cruz,1985-03-14').
 *
 * First occurrence wins, order is preserved, output is deterministic.
 */
import type { RawRow, RowTransform } from '../types.js';
import { checksumOf } from '../checksum.js';
import { looseDobKey, looseName, pick } from './helpers.js';

/** Natural identity key per record type (format-insensitive). */
export function dedupeKey(row: RawRow): string {
  const p = row.payload;
  switch (row.recordType) {
    case 'patient': {
      const name = looseName(pick(p, 'full_name', 'fullName') ?? [pick(p, 'first_name'), pick(p, 'last_name')].filter(Boolean).join(' '));
      const dob = looseDobKey(pick(p, 'dob', 'dateOfBirth'));
      const city = String(pick(p, 'city') ?? '').trim().toUpperCase();
      if (name || dob) return `patient|${name}|${dob}|${city}`;
      break;
    }
    case 'claim': {
      const n = pick(p, 'claim_number', 'claimNumber');
      if (n) return `claim|${String(n).trim().toUpperCase()}`;
      break;
    }
    case 'lab_result': {
      const n = pick(p, 'lis_order_id', 'orderId', 'order_id');
      if (n) return `lab_result|${String(n).trim().toUpperCase()}`;
      break;
    }
    case 'insurance_policy': {
      const n = pick(p, 'policy_number', 'policyNumber');
      if (n) return `insurance_policy|${String(n).trim().toUpperCase()}`;
      break;
    }
    default:
      break;
  }
  // Fallback: exact natural id, then payload content.
  return `${row.recordType}|${row.sourceRecordId || checksumOf(p)}`;
}

export const deduplicate: RowTransform = (rows: RawRow[]): RawRow[] => {
  const seen = new Set<string>();
  const out: RawRow[] = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};
