/**
 * Billing — claims (status/payer filters) and invoices (grouped claim
 * totals per encounter). Patient identity is masked for BILLER/ANALYST
 * (billing may see amounts; clinical identity is masked clinical read).
 */
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import { paged, type Paged } from '../../lib/envelope.js';
import { resolvePatientForUser } from '../../lib/patientScope.js';
import { dec } from '../../lib/serialize.js';
import { auditRead } from '../../middleware/audit.js';
import { maskPatientForRole } from '../../middleware/masking.js';

export const ClaimsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'SUBMITTED', 'PENDING', 'PAID', 'DENIED', 'APPEALED']).optional(),
  payerId: z.string().uuid().optional(),
  patientId: z.string().optional(),
});

export const InvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['OPEN', 'SETTLED']).optional(),
  encounterId: z.string().optional(),
  patientId: z.string().optional(),
});

type ClaimRow = {
  id: string;
  patientId: string;
  encounterId: string;
  claimNumber: string;
  status: string;
  billedAmount: unknown;
  paidAmount: unknown;
  submittedAt: Date;
  sourceUpdatedAt: Date;
  paidAt: Date | null;
  payer: { id: string; code: string; name: string; type: string };
  patient: { id: string; mrn: string; firstName: string; lastName: string; dateOfBirth: Date };
};

const CLAIM_SELECT = {
  id: true,
  patientId: true,
  encounterId: true,
  claimNumber: true,
  status: true,
  billedAmount: true,
  paidAmount: true,
  submittedAt: true,
  sourceUpdatedAt: true,
  paidAt: true,
  payer: { select: { id: true, code: true, name: true, type: true } },
  patient: { select: { id: true, mrn: true, firstName: true, lastName: true, dateOfBirth: true } },
} as const;

export async function listClaims(req: Request, query: z.infer<typeof ClaimsQuerySchema>): Promise<Paged<unknown>> {
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.payerId) where.payerId = query.payerId;
  if (query.patientId) where.patientId = query.patientId;
  if (req.auth!.role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    where.patientId = own?.id ?? '__none__';
  }
  const { page, pageSize } = query;
  const [total, rows] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CLAIM_SELECT,
    }),
  ]);
  const role = req.auth!.role;
  const items = (rows as unknown as ClaimRow[]).map(({ patient, ...c }) => ({
    ...c,
    billedAmount: dec(c.billedAmount),
    paidAmount: dec(c.paidAmount),
    patient: maskPatientForRole(patient, role),
  }));
  auditRead(req, { entityType: 'claims', entityId: ':list', action: 'GET /api/billing/claims' });
  return paged(items, page, pageSize, total);
}

export interface Invoice {
  invoiceNumber: string;
  encounterId: string;
  patientId: string;
  claimCount: number;
  billedTotal: number;
  paidTotal: number;
  outstanding: number;
  status: 'OPEN' | 'SETTLED';
  payerNames: string[];
  lastActivityAt: Date;
  patient?: unknown;
}

export async function listInvoices(req: Request, query: z.infer<typeof InvoicesQuerySchema>): Promise<Paged<Invoice>> {
  const where: Record<string, unknown> = {};
  if (query.encounterId) where.encounterId = query.encounterId;
  if (query.patientId) where.patientId = query.patientId;
  if (req.auth!.role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    where.patientId = own?.id ?? '__none__';
  }
  const rows = (await prisma.claim.findMany({ where, select: CLAIM_SELECT })) as unknown as ClaimRow[];

  const groups = new Map<string, ClaimRow[]>();
  for (const c of rows) {
    const arr = groups.get(c.encounterId);
    if (arr) arr.push(c);
    else groups.set(c.encounterId, [c]);
  }

  const role = req.auth!.role;
  let invoices: Invoice[] = [...groups.entries()].map(([encounterId, claims]) => {
    const billedTotal = claims.reduce((s, c) => s + Number(c.billedAmount ?? 0), 0);
    const paidTotal = claims.reduce((s, c) => s + Number(c.paidAmount ?? 0), 0);
    const lastActivityAt = new Date(
      Math.max(...claims.map((c) => Math.max(c.sourceUpdatedAt.getTime(), c.paidAt?.getTime() ?? 0))),
    );
    const first = claims[0] as ClaimRow;
    return {
      invoiceNumber: `INV-${encounterId.slice(0, 8).toUpperCase()}`,
      encounterId,
      patientId: first.patientId,
      claimCount: claims.length,
      billedTotal,
      paidTotal,
      outstanding: Math.max(0, billedTotal - paidTotal),
      status: billedTotal - paidTotal <= 0 ? 'SETTLED' : 'OPEN',
      payerNames: [...new Set(claims.map((c) => c.payer.name))],
      lastActivityAt,
      patient: maskPatientForRole(first.patient, role),
    };
  });

  if (query.status) invoices = invoices.filter((i) => i.status === query.status);
  invoices.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

  const { page, pageSize } = query;
  const start = (page - 1) * pageSize;
  auditRead(req, { entityType: 'invoices', entityId: ':list', action: 'GET /api/billing/invoices' });
  return paged(invoices.slice(start, start + pageSize), page, pageSize, invoices.length);
}
