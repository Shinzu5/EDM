/**
 * ML risk — GET /api/ml/risk/:patientId.
 *
 * Reliability-first: we call the DQ gate in @medidata/ml (if exported) and
 * refuse to score when the gate is failing, returning 409 + code
 * DQ_GATE_FAILED with the gate state in the envelope ("AI reliability").
 * @medidata/ml is currently a stub (`export {}` — owned by the parallel
 * agent), so a deterministic local heuristic provides the fallback bin.
 */
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { ApiError } from '../../lib/envelope.js';
import { pickFn, tryImport } from '../../lib/dynamicImport.js';
import { auditRead } from '../../middleware/audit.js';

const CHRONIC_PREFIXES = ['E11', 'I10', 'J18', 'N39', 'K29'];
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

interface Factor {
  factor: string;
  contribution: number;
}

async function localRiskScore(patientId: string): Promise<{
  patientId: string;
  goldenId: string | null;
  riskScore: number;
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH';
  topFactors: Factor[];
  modelVersion: string;
  generatedAt: Date;
}> {
  const [patient, results, encounters, claims] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId } }),
    prisma.labResult.findMany({ where: { patientId }, select: { abnormalFlag: true, testCode: true } }),
    prisma.encounter.findMany({ where: { patientId }, select: { type: true, diagnosisCode: true, admittedAt: true } }),
    prisma.claim.findMany({ where: { patientId }, select: { status: true } }),
  ]);
  if (!patient) throw new ApiError(404, 'NOT_FOUND', `Patient ${patientId} not found`);

  const age = Math.max(0, new Date().getUTCFullYear() - patient.dateOfBirth.getUTCFullYear());
  const abnormalCount = results.filter((r) => r.abnormalFlag).length;
  const chronicDx = new Set(
    encounters.filter((e) => CHRONIC_PREFIXES.some((p) => e.diagnosisCode.startsWith(p))).map((e) => e.diagnosisCode),
  ).size;
  const deniedClaims = claims.filter((c) => ['DENIED', 'APPEALED'].includes(c.status)).length;
  const encounterCount = encounters.length;

  const z = 0.35 * Math.min(age / 80, 1) + 0.4 * Math.min(abnormalCount / 5, 1) + 0.5 * chronicDx + 0.3 * deniedClaims + 0.15 * Math.min(encounterCount / 10, 1);
  const riskScore = Math.round(sigmoid(z - 1) * 1000) / 1000;

  const factors: Factor[] = [
    { factor: `age_${age}`, contribution: Math.round(0.35 * Math.min(age / 80, 1) * 1000) / 1000 },
    { factor: `abnormal_results_${abnormalCount}`, contribution: Math.round(0.4 * Math.min(abnormalCount / 5, 1) * 1000) / 1000 },
    { factor: `chronic_diagnoses_${chronicDx}`, contribution: Math.round(0.5 * chronicDx * 1000) / 1000 },
    { factor: `denied_claims_${deniedClaims}`, contribution: Math.round(0.3 * deniedClaims * 1000) / 1000 },
    { factor: `encounters_12mo_${encounterCount}`, contribution: Math.round(0.15 * Math.min(encounterCount / 10, 1) * 1000) / 1000 },
  ].sort((a, b) => b.contribution - a.contribution);

  return {
    patientId,
    goldenId: null,
    riskScore,
    riskBand: riskScore < 0.34 ? 'LOW' : riskScore < 0.67 ? 'MEDIUM' : 'HIGH',
    topFactors: factors.slice(0, 3),
    modelVersion: 'local-heuristic-v1 (fallback — @medidata/ml exports no model yet)',
    generatedAt: new Date(),
  };
}

export async function riskScore(req: Request, patientId: string): Promise<unknown> {
  const mod = await tryImport('@medidata/ml');

  // 1) DQ gate first — AI reliability: never score on failing data quality.
  const gateFn = pickFn(mod, ['getRiskGate', 'checkDqGate', 'evaluateDqGate', 'riskGate']);
  if (gateFn) {
    try {
      const gate = (await gateFn(patientId)) as { ok?: boolean; passed?: boolean; [k: string]: unknown } | null;
      const failing = gate && (gate.ok === false || gate.passed === false);
      if (failing) {
        throw new ApiError(409, 'DQ_GATE_FAILED', 'Risk scoring unavailable: the data-quality gate is failing', { gate });
      }
      // 2) Model scoring when available.
      const scoreFn = pickFn(mod, ['evaluatePatientRisk', 'scorePatientRisk', 'predictRisk', 'assessPatientRisk']);
      if (scoreFn) {
        try {
          const scored = await scoreFn(patientId);
          if (scored && typeof scored === 'object') {
            auditRead(req, { entityType: 'mlRisk', entityId: patientId, action: 'GET /api/ml/risk/:patientId' });
            return { ...(scored as Record<string, unknown>), gate: gate ?? undefined };
          }
        } catch {
          /* fall back to local scoring */
        }
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      /* gate call itself failed → fall through to local scoring */
    }
  }

  auditRead(req, { entityType: 'mlRisk', entityId: patientId, action: 'GET /api/ml/risk/:patientId' });
  return localRiskScore(patientId);
}
