/**
 * Transform 5 — calculateValues: derive measurable facts.
 *
 *  - encounters: LOS (length of stay) in days from admitted/discharged
 *  - claims:     claimTotal and the payer update lag in hours
 *  - lab results: TAT (turnaround) hours from collected→resulted, plus the
 *    abnormal flag derived from the reference range when it is missing
 */
import type { RawRow, RowTransform } from '../types.js';
import { flag } from '../types.js';
import { parseLooseDate, pick, set } from './helpers.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function hoursBetween(fromIso: unknown, toIso: unknown): number | null {
  const a = parseLooseDate(fromIso).value;
  const b = parseLooseDate(toIso).value;
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / MS_PER_HOUR) * 100) / 100;
}

export function calculateLosDays(admittedAt: unknown, dischargedAt: unknown): number | null {
  const a = parseLooseDate(admittedAt).value;
  const b = parseLooseDate(dischargedAt).value;
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / MS_PER_DAY) * 100) / 100;
}

/** Derive H/L flag from a textual reference range like '70-110' or '<200'. */
export function deriveAbnormalFlag(value: number | null, referenceRange: unknown): string | null {
  if (value === null) return null;
  const rr = String(referenceRange ?? '').trim();
  if (!rr) return null;
  const range = /^<?(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(rr);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (value > high) return 'H';
    if (value < low) return 'L';
    return null;
  }
  const lt = /^<\s*(\d+(?:\.\d+)?)$/.exec(rr);
  if (lt) return value >= Number(lt[1]) ? 'H' : null;
  const gt = /^>\s*(\d+(?:\.\d+)?)$/.exec(rr);
  if (gt) return value <= Number(gt[1]) ? 'L' : null;
  return null;
}

function calculateFor(row: RawRow): RawRow {
  let out = row;
  const p = row.payload;
  switch (row.recordType) {
    case 'encounter': {
      const los = calculateLosDays(pick(p, 'admitted_at', 'admittedAt'), pick(p, 'discharged_at', 'dischargedAt'));
      out = set(out, 'losDays', los);
      break;
    }
    case 'claim': {
      const billed = typeof p.billed_amount === 'number' ? p.billed_amount : null;
      const paid = typeof p.paid_amount === 'number' ? p.paid_amount : null;
      // Claim total = amount actually payable/charged in total (billed when
      // present, else paid). Kept as a distinct derived column for analytics.
      out = set(out, 'claimTotal', billed ?? paid ?? null);
      const lag = hoursBetween(pick(p, 'submitted_at', 'submittedAt'), pick(p, 'source_updated_at', 'sourceUpdatedAt'));
      out = set(out, 'paymentLagHours', lag);
      break;
    }
    case 'lab_result': {
      const collected = pick(p, 'collected_at', 'collectedAt') ?? pick(p, 'ordered_at', 'orderedAt');
      const resulted = pick(p, 'resulted_at', 'resultedAt');
      out = set(out, 'tatHours', hoursBetween(collected, resulted));
      const value = typeof p.valueNumeric === 'number' ? p.valueNumeric : null;
      if (!pick(p, 'abnormal_flag', 'abnormalFlag')) {
        out = set(out, 'abnormal_flag', deriveAbnormalFlag(value, pick(p, 'reference_range', 'referenceRange')));
      }
      break;
    }
    default:
      break;
  }
  // A negative derived TAT would mean inconsistent timestamps — flag it.
  if (out.payload.tatHours === null && pick(p, 'resulted_at', 'resultedAt')) {
    out = flag(out, 'TAT_INVALID');
  }
  return out;
}

export const calculateValues: RowTransform = (rows: RawRow[]): RawRow[] => rows.map(calculateFor);
