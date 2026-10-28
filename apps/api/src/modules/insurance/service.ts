/**
 * Insurance — the Prisma schema has NO InsurancePolicy model (see report:
 * schema gap), so policies are DERIVED from claims × payers × patients:
 * one policy per (patient, payer) pair evidenced by at least one claim.
 * memberNumber is derived (`<PAYER-CODE>-<MRN>`), status is ACTIVE when the
 * payer is not SELF-PAY and the pair had claim activity within 365 days of
 * the most recent activity in the dataset.
 */
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError, paged, type Paged } from '../../lib/envelope.js';
import { auditRead } from '../../middleware/audit.js';
import { shouldMask } from '../../middleware/masking.js';

const ACTIVE_WINDOW_DAYS = 365;

export interface DerivedPolicy {
  id: string;
  patientId: string;
  mrn: string;
  payerId: string;
  payerCode: string;
  payerName: string;
  payerType: string;
  memberNumber: string;
  effectiveAt: Date;
  terminatedAt: null;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  claimCount: number;
  billedTotal: number;
  paidTotal: number;
  openClaims: number;
  lastActivityAt: Date;
}

interface ClaimSeedRow {
  id: string;
  patientId: string;
  status: string;
  billedAmount: unknown;
  paidAmount: unknown;
  submittedAt: Date;
  paidAt: Date | null;
  sourceUpdatedAt: Date;
  payer: { id: string; code: string; name: string; type: string };
  patient: { mrn: string };
}

function toPolicy(row: ClaimSeedRow, claims: ClaimSeedRow[], datasetLatest: Date): DerivedPolicy {
  const payer = row.payer;
  const billedTotal = claims.reduce((s, c) => s + Number(c.billedAmount ?? 0), 0);
  const paidTotal = claims.reduce((s, c) => s + Number(c.paidAmount ?? 0), 0);
  const openClaims = claims.filter((c) => !['PAID'].includes(c.status)).length;
  const effectiveAt = new Date(Math.min(...claims.map((c) => c.submittedAt.getTime())));
  const lastActivityAt = new Date(Math.max(...claims.map((c) => Math.max(c.sourceUpdatedAt.getTime(), c.submittedAt.getTime()))));
  const withinWindow = datasetLatest.getTime() - lastActivityAt.getTime() <= ACTIVE_WINDOW_DAYS * 86_400_000;
  return {
    id: row.id, // a real claim uuid doubles as the policy id
    patientId: row.patientId,
    mrn: row.patient.mrn,
    payerId: payer.id,
    payerCode: payer.code,
    payerName: payer.name,
    payerType: payer.type,
    memberNumber: `${payer.code}-${row.patient.mrn}`,
    effectiveAt,
    terminatedAt: null,
    status: payer.type === 'SELF' || !withinWindow ? 'INACTIVE' : 'ACTIVE',
    claimCount: claims.length,
    billedTotal,
    paidTotal,
    openClaims,
    lastActivityAt,
  };
}

async function fetchClaimRows(patientIds?: string[]): Promise<ClaimSeedRow[]> {
  return prisma.claim.findMany({
    where: patientIds ? { patientId: { in: patientIds } } : undefined,
    include: {
      payer: { select: { id: true, code: true, name: true, type: true } },
      patient: { select: { mrn: true } },
    },
    orderBy: { submittedAt: 'asc' },
  }) as unknown as Promise<ClaimSeedRow[]>;
}

/** Derive policy objects for a set of patient ids (used by Patient360 too). */
export async function derivePoliciesForPatients(patientIds: string[]): Promise<DerivedPolicy[]> {
  if (patientIds.length === 0) return [];
  const rows = await fetchClaimRows(patientIds);
  return groupToPolicies(rows);
}

function groupToPolicies(rows: ClaimSeedRow[]): DerivedPolicy[] {
  if (rows.length === 0) return [];
  const datasetLatest = new Date(Math.max(...rows.map((r) => Math.max(r.sourceUpdatedAt.getTime(), r.submittedAt.getTime()))));
  const groups = new Map<string, ClaimSeedRow[]>();
  for (const r of rows) {
    const key = `${r.patientId}|${r.payer.id}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()].map((claims) => toPolicy(claims[0] as ClaimSeedRow, claims, datasetLatest));
}

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).optional(),
  payerCode: z.string().trim().optional(),
});

export async function listPolicies(req: Request, query: z.infer<typeof ListQuerySchema>): Promise<Paged<DerivedPolicy>> {
  let rows = await fetchClaimRows(query.patientId ? [query.patientId] : undefined);
  if (req.auth!.role === 'PATIENT') {
    const { resolvePatientForUser } = await import('../../lib/patientScope.js');
    const own = await resolvePatientForUser(req.auth!);
    rows = rows.filter((r) => r.patientId === own?.id);
  }
  let policies = groupToPolicies(rows);
  if (query.status) policies = policies.filter((p) => p.status === query.status);
  if (query.payerCode) policies = policies.filter((p) => p.payerCode === query.payerCode);
  const total = policies.length;
  const start = (query.page - 1) * query.pageSize;
  auditRead(req, { entityType: 'insurancePolicies', entityId: ':list', action: 'GET /api/insurance/policies' });
  return paged(policies.slice(start, start + query.pageSize), query.page, query.pageSize, total);
}

export interface EligibilityPayload {
  patientId: string;
  mrn: string;
  eligible: boolean;
  activePolicyCount: number;
  coverage: {
    payerName: string;
    payerCode: string;
    memberNumber: string;
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    billedTotal: number;
    paidTotal: number;
    openClaims: number;
    lastActivityAt: Date;
  }[];
  summary: { totalBilled: number; totalPaid: number; openClaims: number };
}

export async function eligibility(req: Request, patientId: string): Promise<EligibilityPayload> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, mrn: true } });
  if (!patient) throw new ApiError(404, 'NOT_FOUND', `Patient ${patientId} not found`);
  if (req.auth!.role === 'PATIENT') {
    const { resolvePatientForUser } = await import('../../lib/patientScope.js');
    const own = await resolvePatientForUser(req.auth!);
    if (!own || own.id !== patient.id) throw new ApiError(403, 'FORBIDDEN', 'Patients may only access their own record');
  }
  const policies = await derivePoliciesForPatients([patient.id]);
  auditRead(req, { entityType: 'insuranceEligibility', entityId: patient.id, action: 'GET /api/insurance/eligibility/:patientId' });
  return {
    patientId: patient.id,
    mrn: patient.mrn,
    eligible: policies.some((p) => p.status === 'ACTIVE'),
    activePolicyCount: policies.filter((p) => p.status === 'ACTIVE').length,
    coverage: policies.map((p) => ({
      payerName: p.payerName,
      payerCode: p.payerCode,
      memberNumber: p.memberNumber,
      status: p.status,
      billedTotal: p.billedTotal,
      paidTotal: p.paidTotal,
      openClaims: p.openClaims,
      lastActivityAt: p.lastActivityAt,
    })),
    summary: {
      totalBilled: policies.reduce((s, p) => s + p.billedTotal, 0),
      totalPaid: policies.reduce((s, p) => s + p.paidTotal, 0),
      openClaims: policies.reduce((s, p) => s + p.openClaims, 0),
    },
  };
}
