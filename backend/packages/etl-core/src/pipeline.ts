/**
 * ETL pipeline orchestration: extract → transform → load (staging).
 *
 * Every run writes a `gov.PipelineRun` row (started/finished/rowsIn/rowsOut/
 * status/errorMsg) — SUCCESS or FAILED, no exceptions swallowed without a
 * trace.
 */
import type { Connector, EtlContext, RawRow, RowTransform, StagingLoadResult, WarehouseLoadResult } from './types.js';
import { ctxLog, ctxNow } from './types.js';
import { loadToStaging } from './loader.js';
import { DEFAULT_TRANSFORMS, applyTransforms } from './transforms/index.js';
import { loadWarehouse, loadWarehouseFromApp } from './warehouse-loader.js';

export interface EtlPipelineResult {
  pipelineRunId: string;
  connector: string;
  rowsIn: number;
  rowsOut: number;
  staged: StagingLoadResult;
  /** Transformed rows (fed to the warehouse loader by the worker). */
  rows: RawRow[];
  durationMs: number;
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return msg.slice(0, 1900);
}

export async function runEtlPipeline(
  connector: Connector,
  ctx: EtlContext,
  opts?: { transforms?: RowTransform[] },
): Promise<EtlPipelineResult> {
  const startedAt = ctxNow(ctx);
  const run = await ctx.prisma.pipelineRun.create({
    data: { pipelineName: `etl:${connector.name}`, status: 'RUNNING', startedAt },
  });
  let rowsIn = 0;
  try {
    const raw: RawRow[] = [];
    for await (const row of connector.extract()) raw.push(row);
    rowsIn = raw.length;
    ctxLog(ctx, 'etl.extracted', { connector: connector.name, rowsIn });

    // ELT-friendly: land RAW rows first, then transform the in-memory copy.
    const staged = await loadToStaging(raw, ctx);
    const transforms = opts?.transforms ?? DEFAULT_TRANSFORMS.map((t) => t.apply);
    const rowsOut = applyTransforms(raw, transforms);

    const finishedAt = ctxNow(ctx);
    await ctx.prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: 'SUCCESS', rowsIn, rowsOut: rowsOut.length, finishedAt },
    });
    ctxLog(ctx, 'etl.pipeline.done', { connector: connector.name, rowsIn, rowsOut: rowsOut.length });
    return {
      pipelineRunId: run.id,
      connector: connector.name,
      rowsIn,
      rowsOut: rowsOut.length,
      staged,
      rows: rowsOut,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
  } catch (err) {
    await ctx.prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', rowsIn, rowsOut: 0, errorMsg: errorText(err), finishedAt: ctxNow(ctx) },
    });
    ctxLog(ctx, 'etl.pipeline.failed', { connector: connector.name, error: errorText(err) });
    throw err;
  }
}

export interface WarehousePipelineResult {
  pipelineRunId: string;
  counts: WarehouseLoadResult;
  appProjection: { patients: number; encounters: number };
}

/** Warehouse load leg: siloed rows → dims/facts + app.* → warehouse projection. */
export async function runWarehouseLoad(rows: RawRow[], ctx: EtlContext): Promise<WarehousePipelineResult> {
  const startedAt = ctxNow(ctx);
  const run = await ctx.prisma.pipelineRun.create({
    data: { pipelineName: 'etl:warehouse', status: 'RUNNING', startedAt },
  });
  try {
    const counts = await loadWarehouse(rows, ctx);
    const appProjection = await loadWarehouseFromApp(ctx);
    const finishedAt = ctxNow(ctx);
    const rowsOut =
      counts.factClaims + counts.factLabResults + counts.factEncounters + appProjection.encounters;
    await ctx.prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: 'SUCCESS', rowsIn: rows.length + appProjection.patients, rowsOut, finishedAt },
    });
    return { pipelineRunId: run.id, counts, appProjection };
  } catch (err) {
    await ctx.prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', rowsIn: rows.length, errorMsg: errorText(err), finishedAt: ctxNow(ctx) },
    });
    throw err;
  }
}
