/**
 * @medidata/etl-core — core ETL contracts.
 *
 * A `Connector` extracts `RawRow`s from a siloed source system (file-based in
 * this project: fixtures/). Transforms are pure functions over row arrays and
 * the loader lands rows idempotently into `staging.RawSourceRecord`.
 */
import type { PrismaClient, SourceSystem } from '@medidata/db';

/** One raw record extracted from a source system, pre-transform. */
export interface RawRow {
  sourceSystem: SourceSystem;
  /** Logical entity type, e.g. 'patient', 'lab_result', 'claim'. */
  recordType: string;
  /** Natural source-side identifier (EMR patient id, claim number, ...). */
  sourceRecordId: string;
  payload: Record<string, unknown>;
}

/** A source-system connector: streams raw rows. */
export interface Connector {
  name: string;
  sourceSystem: SourceSystem;
  extract(): AsyncIterable<RawRow>;
}

/** A pure row transform (one per deck step: dedupe, correct, convert, ...). */
export type RowTransform = (rows: RawRow[]) => RawRow[];

/** Named transform wrapper. */
export interface NamedTransform {
  name: string;
  apply: RowTransform;
}

/** Result of landing rows into staging. */
export interface StagingLoadResult {
  attempted: number;
  created: number;
  updated: number;
}

export interface WarehouseLoadResult {
  dimPatients: number;
  dimProviders: number;
  dimLocations: number;
  dimPayers: number;
  dimDates: number;
  dimTests: number;
  factEncounters: number;
  factLabResults: number;
  factClaims: number;
}

/**
 * Everything a pipeline step needs. `prisma` is typed as a subset-friendly
 * PrismaClient; tests inject fakes via `as unknown as EtlContext['prisma']`.
 */
export interface EtlContext {
  prisma: PrismaClient;
  /** Override the fixtures directory (defaults to <repo-root>/fixtures). */
  fixturesDir?: string;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /** Structured log sink (defaults to console-free noop). */
  log?: (event: string, meta?: Record<string, unknown>) => void;
}

export function ctxNow(ctx: EtlContext): Date {
  return ctx.now ? ctx.now() : new Date();
}

export function ctxLog(ctx: EtlContext, event: string, meta?: Record<string, unknown>): void {
  if (ctx.log) ctx.log(event, meta);
}

/** Read a possibly-missing field under any of the given aliases. */
export function field(payload: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    const v = payload[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** Shallow payload copy with patches applied (undefined values removed). */
export function withPayload(row: RawRow, patch: Record<string, unknown>): RawRow {
  const next: Record<string, unknown> = { ...row.payload };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return { ...row, payload: next };
}

/** Append a data-quality / transform flag to a row's payload. */
export function flag(row: RawRow, code: string): RawRow {
  const existing = Array.isArray(row.payload._flags) ? (row.payload._flags as string[]) : [];
  if (existing.includes(code)) return row;
  return { ...row, payload: { ...row.payload, _flags: [...existing, code] } };
}

export function flagsOf(row: RawRow): string[] {
  return Array.isArray(row.payload._flags) ? (row.payload._flags as string[]) : [];
}
