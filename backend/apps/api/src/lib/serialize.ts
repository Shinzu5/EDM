/**
 * JSON-safe serialization for audit rows / outbox payloads:
 * Dates → ISO strings, Prisma Decimals → numbers, Buffers → base64,
 * capped depth & string length so audit rows can never blow up a request.
 */
import type { Prisma } from '@medidata/db';

const MAX_STRING = 2000;
const MAX_DEPTH = 6;
const MAX_ARRAY = 100;

export function toJsonSafe(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > MAX_DEPTH) return '[truncated: max depth]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('base64').slice(0, MAX_STRING);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((v) => toJsonSafe(v, depth + 1));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown> & { toJSON?: () => unknown };
    // Prisma.Decimal and friends expose toJSON().
    if (typeof obj.toJSON === 'function') {
      try {
        const t = obj.toJSON();
        if (typeof t === 'number' || typeof t === 'string') {
          const n = Number(t);
          return Number.isNaN(n) ? t : n;
        }
      } catch {
        /* fall through */
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'function') continue;
      out[k] = toJsonSafe(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Convert a Prisma Decimal (or anything numeric) to a JS number. */
export function dec(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v as never);
  return Number.isNaN(n) ? null : n;
}

export type { Prisma };
