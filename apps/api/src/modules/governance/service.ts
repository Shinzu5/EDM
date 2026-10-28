/**
 * Governance — catalog (with steward names), glossary, lineage (recent
 * PipelineRuns + grouped by pipelineName), quality scorecard (latest
 * DqResult per DqRule), freshness (computed app-side from FreshnessSla
 * targets vs. max updatedAt of the target table), audit (paginated
 * app.AuditLog, AUDITOR/ADMIN only).
 */
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import { paged, type Paged } from '../../lib/envelope.js';
import { toJsonSafe } from '../../lib/serialize.js';
import { auditRead } from '../../middleware/audit.js';

export async function catalog(): Promise<unknown[]> {
  const rows = await prisma.dataCatalog.findMany({
    orderBy: [{ schemaName: 'asc' }, { tableName: 'asc' }],
    include: { stewardUser: { select: { id: true, fullName: true, email: true } } },
  });
  return rows.map(({ stewardUser, ...c }) => ({
    ...c,
    stewardUserId: stewardUser?.id ?? null,
    stewardName: stewardUser?.fullName ?? null,
    stewardEmail: stewardUser?.email ?? null,
  }));
}

export async function glossary(): Promise<unknown[]> {
  const rows = await prisma.glossary.findMany({
    orderBy: { term: 'asc' },
    include: { ownerUser: { select: { id: true, fullName: true, email: true } } },
  });
  return rows.map(({ ownerUser, ...g }) => ({
    ...g,
    ownerUserId: ownerUser?.id ?? null,
    ownerName: ownerUser?.fullName ?? null,
  }));
}

/** Static upstream heuristics for lineage edges (source → target). */
const UPSTREAM: Record<string, string[]> = {
  'app.patients': ['EMR', 'LIS', 'LEGACY'],
  'app.encounters': ['EMR'],
  'app.lab_results': ['LIS'],
  'app.claims': ['BILLING', 'INSURANCE'],
  'staging.raw_source_record': ['EMR', 'LIS', 'BILLING', 'INSURANCE', 'LEGACY'],
  'warehouse.dim_patient': ['app.patients'],
  'warehouse.fact_claim': ['app.claims'],
  'warehouse.fact_lab_results': ['app.lab_results'],
  'warehouse.fact_encounters': ['app.encounters'],
};

export async function lineage(): Promise<unknown> {
  const [runs, catalogRows] = await Promise.all([
    prisma.pipelineRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 }),
    prisma.dataCatalog.findMany({ select: { schemaName: true, tableName: true } }),
  ]);

  const groups = new Map<string, typeof runs>();
  for (const r of runs) {
    const arr = groups.get(r.pipelineName);
    if (arr) arr.push(r);
    else groups.set(r.pipelineName, [r]);
  }

  const nodes = catalogRows.map((c) => {
    const node = `${c.schemaName}.${c.tableName}`;
    return {
      node,
      schemaName: c.schemaName,
      table: c.tableName,
      upstream: UPSTREAM[node] ?? [],
      pipeline: [...groups.keys()].find((p) => p.toLowerCase().includes(c.schemaName)) ?? null,
    };
  });

  return {
    nodes,
    recentRuns: runs,
    groups: [...groups.entries()].map(([pipelineName, rs]) => ({
      pipelineName,
      runCount: rs.length,
      lastStatus: rs[0]?.status ?? null,
      lastStartedAt: rs[0]?.startedAt ?? null,
      failedRuns: rs.filter((r) => r.status === 'FAILED').length,
      totalRowsIn: rs.reduce((s, r) => s + (r.rowsIn ?? 0), 0),
      totalRowsOut: rs.reduce((s, r) => s + (r.rowsOut ?? 0), 0),
    })),
  };
}

/** Latest DqResult per DqRule → QualityScorecard (shared/schemas shape). */
export async function qualityScorecard(): Promise<{
  overallScore: number;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  criticalFailures: number;
  results: unknown[];
  generatedAt: Date;
}> {
  const rules = await prisma.dqRule.findMany({
    where: { isActive: true },
    include: { results: { orderBy: { checkedAt: 'desc' }, take: 1 } },
    orderBy: { code: 'asc' },
  });
  const results = rules
    .map((r) => ({ rule: { ...r, results: undefined }, result: r.results[0] }))
    .filter((x) => x.result)
    .map(({ rule, result }) => ({
      id: result!.id,
      ruleId: rule.id,
      runId: result!.runId,
      passed: result!.passed,
      failedCount: result!.failedCount,
      sampleKeys: toJsonSafe(result!.sampleKeys),
      checkedAt: result!.checkedAt,
      rule,
    }));
  const totalRules = results.length;
  const passedRules = results.filter((r) => r.passed).length;
  const failedRules = totalRules - passedRules;
  const criticalFailures = results.filter((r) => !r.passed && r.rule.severity === 'CRITICAL').length;
  const overallScore = totalRules === 0 ? 100 : Math.round((passedRules / totalRules) * 1000) / 10;
  return { overallScore, totalRules, passedRules, failedRules, criticalFailures, results, generatedAt: new Date() };
}

export async function quality(req: Request): Promise<unknown> {
  const scorecard = await qualityScorecard();
  auditRead(req, { entityType: 'governanceQuality', entityId: ':scorecard', action: 'GET /api/governance/quality' });
  return scorecard;
}

/** Map FreshnessSla.tableName → a timestamp probe over the target table. */
type Probe = () => Promise<Date | null>;

function probeAggregate(factory: () => { aggregate: (args: { _max: { updatedAt: true } }) => Promise<{ _max: { updatedAt: Date | null } } } }): Probe {
  return async () => (await factory().aggregate({ _max: { updatedAt: true } }))._max.updatedAt;
}

const PROBES: Record<string, Probe> = {
  'app.patients': probeAggregate(() => prisma.patient),
  'app.encounters': probeAggregate(() => prisma.encounter),
  'app.lab_results': probeAggregate(() => prisma.labResult),
  'app.claims': probeAggregate(() => prisma.claim),
  'warehouse.fact_claim': probeAggregate(() => prisma.dimPatient), // warehouse load proxy (facts have no updatedAt)
  'warehouse.dim_patient': probeAggregate(() => prisma.dimPatient),
  'staging.raw_source_record': async () =>
    (await prisma.rawSourceRecord.aggregate({ _max: { extractedAt: true } }))._max.extractedAt ?? null,
};

export async function freshness(): Promise<unknown[]> {
  const slas = await prisma.freshnessSla.findMany({
    include: { ownerUser: { select: { id: true, fullName: true } } },
    orderBy: { tableName: 'asc' },
  });
  const now = Date.now();
  return Promise.all(
    slas.map(async (sla) => {
      const probe = PROBES[sla.tableName];
      let lastLoadedAt: Date | null = null;
      if (probe) {
        try {
          lastLoadedAt = await probe();
        } catch {
          lastLoadedAt = null;
        }
      }
      const stalenessMinutes = lastLoadedAt ? Math.round((now - lastLoadedAt.getTime()) / 60_000) : null;
      return {
        tableName: sla.tableName,
        maxStalenessMinutes: sla.maxStalenessMinutes,
        lastLoadedAt,
        stalenessMinutes,
        isStale: stalenessMinutes === null ? true : stalenessMinutes > sla.maxStalenessMinutes,
        ownerUserId: sla.ownerUser?.id ?? null,
        ownerName: sla.ownerUser?.fullName ?? null,
      };
    }),
  );
}

export const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  entityType: z.string().trim().optional(),
  action: z.string().trim().optional(),
  actorUserId: z.string().optional(),
});

export async function auditLog(req: Request, query: z.infer<typeof AuditQuerySchema>): Promise<Paged<unknown>> {
  const where: Record<string, unknown> = {};
  if (query.entityType) where.entityType = query.entityType;
  if (query.action) where.action = { contains: query.action };
  if (query.actorUserId) where.actorUserId = query.actorUserId;
  const { page, pageSize } = query;
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return paged(rows, page, pageSize, total);
}
