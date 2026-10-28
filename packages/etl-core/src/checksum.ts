/**
 * Stable SHA-256 checksums over canonical JSON.
 *
 * Canonical JSON = recursively key-sorted, no whitespace variance, so the same
 * logical payload always hashes identically regardless of key insertion order.
 * This powers the staging idempotency key (sourceSystem+recordType+id+checksum).
 */
import { createHash } from 'node:crypto';

/** Recursively sort object keys so serialization is deterministic. */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    const v = src[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

/** Deterministic JSON string for any value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** sha256 (hex) of a string. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** sha256 (hex) of the canonical JSON of a value. */
export function checksumOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Deterministic UUID-shaped id derived from a natural key.
 * Used for idempotent warehouse fact upserts (`id` is a plain String column,
 * so we can supply our own stable surrogate without touching the schema).
 */
export function deterministicUuid(namespace: string, ...parts: string[]): string {
  const h = sha256Hex([namespace, ...parts].join('|'));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
