/**
 * Defensive display formatters. API responses may contain masked strings
 * (e.g. "***" for PHI the role may not see) instead of real values, so every
 * formatter accepts `unknown` and degrades to an em dash.
 */
import { format } from 'date-fns';

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function formatDate(value: unknown): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '—';
}

export function formatDateTime(value: unknown): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd HH:mm') : '—';
}

export function formatNumber(value: unknown, digits = 0): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatMoney(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatPercent(value: unknown, digits = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}%`;
}

/** Shorten UUIDs for dense tables while keeping them recognizable. */
export function shortId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '—';
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

/** Hours between two timestamps; null when either side is missing. */
export function hoursBetween(start: unknown, end: unknown): number | null {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/** Turn arbitrary JSON into flat key/value rows for detail views. */
export function toKeyValues(value: unknown, depth = 0): Array<{ key: string; value: string }> {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [{ key: '', value: String(value) }];
  if (Array.isArray(value)) {
    if (depth > 2) return [{ key: '', value: `[${value.length} items]` }];
    return value.flatMap((item, index) =>
      toKeyValues(item, depth + 1).map((kv) => ({
        key: kv.key ? `${index}.${kv.key}` : `[${index}]`,
        value: kv.value,
      })),
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (entry !== null && typeof entry === 'object') {
      if (depth > 2) return [{ key, value: '[…]' }];
      return toKeyValues(entry, depth + 1).map((kv) => ({
        key: kv.key ? `${key}.${kv.key}` : key,
        value: kv.value,
      }));
    }
    return [{ key, value: entry === null || entry === undefined ? '—' : String(entry) }];
  });
}
