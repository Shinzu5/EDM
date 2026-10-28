/**
 * Shared loose-parsing helpers used by the transform chain.
 *
 * These are intentionally tolerant: legacy feeds arrive with mixed date
 * formats, odd name casing and non-canonical codes. Everything here is pure
 * and deterministic so each transform is unit-testable in isolation.
 */
import type { RawRow } from '../types.js';
import { field, withPayload } from '../types.js';

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE_RE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export interface ParsedDate {
  /** ISO string ('YYYY-MM-DD' for date-only inputs, full ISO for datetimes), or null. */
  value: string | null;
  dateOnly: boolean;
}

/**
 * Parse a messy date string. Slash-format dates are interpreted MM/DD/YYYY
 * unless the first component is > 12 (then DD/MM/YYYY) — matching how the
 * legacy registry mixed US and day-first exports.
 */
export function parseLooseDate(input: unknown): ParsedDate {
  if (input === null || input === undefined || input === '') return { value: null, dateOnly: true };
  if (input instanceof Date) {
    return Number.isNaN(input.getTime())
      ? { value: null, dateOnly: false }
      : { value: input.toISOString(), dateOnly: false };
  }
  const s = String(input).trim();
  if (!s) return { value: null, dateOnly: true };

  const iso = ISO_DATE_RE.exec(s);
  if (iso) return { value: s, dateOnly: true };
  if (ISO_DATETIME_RE.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? { value: null, dateOnly: false } : { value: d.toISOString(), dateOnly: false };
  }
  const slash = SLASH_DATE_RE.exec(s);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const year = Number(slash[3]);
    const monthFirst = a <= 12;
    const month = monthFirst ? a : b;
    const day = monthFirst ? b : a;
    if (month < 1 || month > 12 || day < 1 || day > 31) return { value: null, dateOnly: true };
    const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { value: isoStr, dateOnly: true };
  }
  // Last resort: let Date parse it (e.g. RFC strings from JSON feeds).
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return { value: d.toISOString(), dateOnly: false };
  return { value: null, dateOnly: true };
}

/** Date-only fields per record type. */
export const DATE_ONLY_FIELDS: Record<string, string[]> = {
  patient: ['dob', 'dateOfBirth', 'date_of_birth'],
  insurance_policy: ['effective_date', 'terminated_date'],
};
export const DATETIME_FIELDS: Record<string, string[]> = {
  patient: [],
  lab_result: ['ordered_at', 'collected_at', 'resulted_at', 'reviewed_at', 'released_at'],
  claim: ['submitted_at', 'source_updated_at', 'paid_at'],
  insurance_policy: [],
  encounter: ['admitted_at', 'discharged_at'],
};

// ---------------------------------------------------------------------------
// Names / codes
// ---------------------------------------------------------------------------

/** Uppercase, strip punctuation, collapse whitespace: 'Juan  D. Cruz' → 'JUAN D CRUZ'. */
export function looseName(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFKD')
    .replace(/[.'’`]/g, '')
    .replace(/[^A-Za-zÀ-ÿ0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Split a full name into cleaned tokens. */
export function nameTokens(value: unknown): string[] {
  const n = looseName(value);
  return n ? n.split(' ') : [];
}

/** Loose dob key used for de-duplication before formal date conversion. */
export function looseDobKey(value: unknown): string {
  return parseLooseDate(value).value ?? '';
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

export type PayloadSource = Record<string, unknown>;

/** Read a field trying several aliases. */
export function pick(payload: PayloadSource, ...names: string[]): unknown {
  return field(payload, ...names);
}

/** Set a field on a row's payload (removes it when value is undefined). */
export function set(row: RawRow, key: string, value: unknown): RawRow {
  return withPayload(row, { [key]: value });
}

/** Whole-payload replacement helper for normalized composite fields. */
export function setMany(row: RawRow, patch: Record<string, unknown>): RawRow {
  return withPayload(row, patch);
}
