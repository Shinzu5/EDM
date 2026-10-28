/**
 * Outcome KPIs (shared OutcomeKpis shape).
 *
 * @medidata/analytics is currently a stub (`export {}` — owned by the
 * parallel agent), so we attempt a runtime dynamic import of
 * `computeOutcomeKpis`/`getOutcomeKpis` and fall back to LOCAL computation:
 *   duplicateRateBefore : patients beyond the first per (normalized name+DOB)
 *   duplicateRateAfter  : after MDM golden merge (0 when MdmMaster is empty,
 *                         i.e. no unresolved duplicates remain post-merge)
 *   avgTatBefore        : mean (resultedAt − collectedAt) hours, raw rows
 *   avgTatAfter         : same over survivor patients only, excluding the
 *                         inconsistent (negative-TAT) rows
 *   billingLagBefore    : mean (sourceUpdatedAt − submittedAt) hours, raw
 *   billingLagAfter     : same excluding >72h outliers (BILL-003 SLA)
 *   dqScore             : latest-per-rule pass rate (QualityScorecard)
 */
import { prisma } from '@medidata/db';
import { tryImport, pickFn } from '../../lib/dynamicImport.js';
import { qualityScorecard } from '../governance/service.js';

interface PatientRow {
  id: string;
  fullNameNormalized: string;
  dateOfBirth: Date;
  sourceSystem: string;
}

const round = (n: number, places = 4): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export async function outcomeKpis(): Promise<{
  duplicateRateBefore: number;
  duplicateRateAfter: number;
  avgTatBefore: number;
  avgTatAfter: number;
  billingLagBefore: number;
  billingLagAfter: number;
  dqScore: number;
}> {
  // Prefer the analytics package once it exports a KPI function.
  const mod = await tryImport('@medidata/analytics');
  const fn = pickFn(mod, ['computeOutcomeKpis', 'getOutcomeKpis']);
  if (fn) {
    try {
      const result = (await fn()) as Awaited<ReturnType<typeof outcomeKpis>>;
      if (result && typeof result.dqScore === 'number') return result;
    } catch {
      /* fall through to local computation */
    }
  }

  const [patients, results, claims, mdmRows, scorecard] = await Promise.all([
    prisma.patient.findMany({ select: { id: true, fullNameNormalized: true, dateOfBirth: true, sourceSystem: true } }),
    prisma.labResult.findMany({
      select: { collectedAt: true, resultedAt: true, patient: { select: { fullNameNormalized: true, dateOfBirth: true, sourceSystem: true } } },
    }),
    prisma.claim.findMany({ select: { submittedAt: true, sourceUpdatedAt: true } }),
    prisma.mdmMaster.findMany({ select: { goldenId: true } }),
    qualityScorecard(),
  ] as const);

  // --- Duplicate rate -------------------------------------------------------
  const keyOf = (p: { fullNameNormalized: string; dateOfBirth: Date }): string =>
    `${p.fullNameNormalized}|${p.dateOfBirth.toISOString().slice(0, 10)}`;
  const groups = new Map<string, PatientRow[]>();
  for (const p of patients as PatientRow[]) {
    const arr = groups.get(keyOf(p));
    if (arr) arr.push(p);
    else groups.set(keyOf(p), [p]);
  }
  const dupExtra = [...groups.values()].reduce((s, g) => s + Math.max(0, g.length - 1), 0);
  const total = (patients as PatientRow[]).length || 1;
  const duplicateRateBefore = round(dupExtra / total);
  const distinctGolden = new Set((mdmRows as Array<{ goldenId: string }>).map((m) => m.goldenId)).size;
  const duplicateRateAfter =
    (mdmRows as unknown[]).length === 0 ? 0 : round(Math.max(0, (total - distinctGolden) / total));

  // --- Turnaround time ------------------------------------------------------
  type ResultRow = { collectedAt: Date; resultedAt: Date | null; patient: { fullNameNormalized: string; dateOfBirth: Date; sourceSystem: string } };
  const resultRows = results as ResultRow[];
  const tats = resultRows
    .filter((r) => r.resultedAt)
    .map((r) => (r.resultedAt!.getTime() - r.collectedAt.getTime()) / 3_600_000);
  const avgTatBefore = round(tats.length ? tats.reduce((s, t) => s + t, 0) / tats.length : 0, 2);
  // Survivor set: the EMR variant of each duplicate group (or the only one).
  const survivorKeys = new Set<string>();
  for (const g of groups.values()) {
    const survivor = g.find((p) => p.sourceSystem === 'EMR') ?? g[0];
    if (survivor) survivorKeys.add(keyOf(survivor));
  }
  const cleanedTats = resultRows
    .filter((r) => r.resultedAt && survivorKeys.has(keyOf(r.patient)))
    .map((r) => (r.resultedAt!.getTime() - r.collectedAt.getTime()) / 3_600_000)
    .filter((t) => t >= 0);
  const avgTatAfter = round(cleanedTats.length ? cleanedTats.reduce((s, t) => s + t, 0) / cleanedTats.length : avgTatBefore, 2);

  // --- Billing lag ----------------------------------------------------------
  type ClaimRow = { submittedAt: Date; sourceUpdatedAt: Date };
  const claimRows = claims as ClaimRow[];
  const lags = claimRows.map((c) => (c.sourceUpdatedAt.getTime() - c.submittedAt.getTime()) / 3_600_000);
  const billingLagBefore = round(lags.length ? lags.reduce((s, t) => s + t, 0) / lags.length : 0, 2);
  const slaBounded = lags.filter((l) => l <= 72);
  const billingLagAfter = round(slaBounded.length ? slaBounded.reduce((s, t) => s + t, 0) / slaBounded.length : billingLagBefore, 2);

  return {
    duplicateRateBefore,
    duplicateRateAfter,
    avgTatBefore,
    avgTatAfter,
    billingLagBefore,
    billingLagAfter,
    dqScore: scorecard.overallScore,
  };
}
