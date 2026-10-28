/**
 * ELT contrast path: load RAW rows into staging FIRST, then apply the
 * transformation logic IN the database via SQL assets
 * (packages/db/sql/warehouse_views.sql — materialized warehouse views plus the
 * `gov.patient_360` federated view over app+staging, i.e. data virtualization
 * with no data copy).
 *
 * `applySqlAssets()` is idempotent: it skips when every asset already exists,
 * otherwise it runs the drop-and-create / CREATE-OR-REPLACE statements.
 */
import { readFile } from 'node:fs/promises';
import type { Connector, EtlContext } from './types.js';
import { ctxLog, ctxNow } from './types.js';
import { loadToStaging } from './loader.js';
import { defaultSqlDir } from './paths.js';

export const SQL_ASSET_FILE = 'warehouse_views.sql';

export const EXPECTED_MATERIALIZED_VIEWS = [
  'warehouse.mv_patient_rollup',
  'warehouse.mv_lab_tat_monthly',
  'warehouse.mv_claim_payment_lag',
] as const;
export const EXPECTED_VIEWS = ['gov.patient_360'] as const;

/**
 * Split a SQL script into individual statements. Comment-stripping and
 * single-quote awareness are enough for our own authored asset file (it
 * contains no dollar-quoted function bodies).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inLineComment = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }
    if (!inSingle && ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === ';' && !inSingle) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export interface SqlAssetsResult {
  applied: boolean;
  statements: number;
  assets: string[];
}

/** Build an IN-list of (schema, table) tuples for pg_catalog lookups. */
function relationTupleInList(relations: readonly string[]): string {
  return relations
    .map((f) => {
      const [s, v] = f.split('.');
      return `('${s}','${v}')`;
    })
    .join(',');
}

/** True when every SQL asset already exists in the database. */
export async function sqlAssetsApplied(ctx: EtlContext): Promise<boolean> {
  const matviews = await ctx.prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM pg_matviews WHERE (schemaname, matviewname) IN ${relationTupleInList(EXPECTED_MATERIALIZED_VIEWS)}`,
  );
  const views = await ctx.prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM pg_views WHERE (schemaname, viewname) IN ${relationTupleInList(EXPECTED_VIEWS)}`,
  );
  const matCount = Number(matviews?.[0]?.n ?? 0);
  const viewCount = Number(views?.[0]?.n ?? 0);
  return matCount === EXPECTED_MATERIALIZED_VIEWS.length && viewCount === EXPECTED_VIEWS.length;
}

/** Execute the SQL asset file (idempotent). */
export async function applySqlAssets(ctx: EtlContext, opts?: { force?: boolean }): Promise<SqlAssetsResult> {
  const assets = [...EXPECTED_MATERIALIZED_VIEWS, ...EXPECTED_VIEWS];
  if (!opts?.force && (await sqlAssetsApplied(ctx))) {
    return { applied: false, statements: 0, assets };
  }
  const sqlPath = `${defaultSqlDir()}/${SQL_ASSET_FILE}`;
  const sql = await readFile(sqlPath, 'utf8');
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    await ctx.prisma.$executeRawUnsafe(stmt);
  }
  ctxLog(ctx, 'elt.sql-assets.applied', { statements: statements.length });
  return { applied: true, statements: statements.length, assets };
}

/** REFRESH the warehouse materialized views (the "in-DB transform" step). */
export async function refreshMaterializedViews(ctx: EtlContext): Promise<string[]> {
  const refreshed: string[] = [];
  for (const mv of EXPECTED_MATERIALIZED_VIEWS) {
    await ctx.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${mv}`);
    refreshed.push(mv);
  }
  return refreshed;
}

export interface EltPipelineResult {
  pipelineRunId: string;
  rowsIn: number;
  staged: { attempted: number; created: number; updated: number };
  sql: SqlAssetsResult;
  refreshed: string[];
}

/**
 * ELT pipeline: raw landing → in-DB transforms (SQL assets + MV refresh).
 * Contrast with `runEtlPipeline`, which transforms in Node before loading.
 */
export async function runEltPipeline(connector: Connector, ctx: EtlContext): Promise<EltPipelineResult> {
  const startedAt = ctxNow(ctx);
  const run = await ctx.prisma.pipelineRun.create({
    data: { pipelineName: `elt:${connector.name}`, status: 'RUNNING', startedAt },
  });
  try {
    const raw = [];
    for await (const row of connector.extract()) raw.push(row);
    const staged = await loadToStaging(raw, ctx);
    const sql = await applySqlAssets(ctx);
    const refreshed = await refreshMaterializedViews(ctx);
    await ctx.prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: 'SUCCESS', rowsIn: raw.length, rowsOut: raw.length, finishedAt: ctxNow(ctx) },
    });
    return { pipelineRunId: run.id, rowsIn: raw.length, staged, sql, refreshed };
  } catch (err) {
    await ctx.prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        errorMsg: (err instanceof Error ? err.message : String(err)).slice(0, 1900),
        finishedAt: ctxNow(ctx),
      },
    });
    throw err;
  }
}
