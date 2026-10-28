/**
 * Labs — orders (GET/POST), results (GET w/ status + TAT filters), review
 * and release transitions.
 *
 * State machine (invalid transitions → 409 INVALID_TRANSITION):
 *   review : COLLECTED | IN_PROGRESS | CORRECTED → REVIEWED
 *   release: REVIEWED                           → RELEASED
 * Release writes an OutboxEvent (delivery projection, ISO 15189 authorized-
 * release note referencing SOP-LAB-002) plus an outbound delivery row.
 */
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError, paged, type Paged } from '../../lib/envelope.js';
import { resolvePatientForUser } from '../../lib/patientScope.js';
import { auditRead } from '../../middleware/audit.js';
import { maskPatientForRole } from '../../middleware/masking.js';

const REVIEWABLE_FROM = ['COLLECTED', 'IN_PROGRESS', 'CORRECTED'];
const RELEASABLE_FROM = ['REVIEWED'];

export const CreateOrderSchema = z.object({
  patientId: z.string().uuid(),
  testCode: z.string().trim().min(1),
  testName: z.string().trim().min(1),
  orderingProviderId: z.string().uuid().optional(),
  orderedAt: z.coerce.date().optional(),
});

export const ResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().optional(),
  testCode: z.string().trim().optional(),
  status: z.enum(['COLLECTED', 'IN_PROGRESS', 'REVIEWED', 'RELEASED', 'CORRECTED']).optional(),
  minTatHours: z.coerce.number().min(0).optional(),
  maxTatHours: z.coerce.number().min(0).optional(),
  // Note: z.coerce.boolean() would turn the string "false" into true — parse explicitly.
  abnormalOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

export const OrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().optional(),
  status: z.string().trim().optional(),
});

function tatHours(r: { collectedAt: Date; resultedAt: Date | null }): number | null {
  if (!r.resultedAt) return null;
  return (r.resultedAt.getTime() - r.collectedAt.getTime()) / 3_600_000;
}

export async function listOrders(req: Request, query: z.infer<typeof OrdersQuerySchema>): Promise<Paged<unknown>> {
  const where: Record<string, unknown> = {};
  if (query.patientId) where.patientId = query.patientId;
  if (query.status) where.status = query.status;
  if (req.auth!.role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    where.patientId = own?.id ?? '__none__';
  }
  const { page, pageSize } = query;
  const [total, rows] = await Promise.all([
    prisma.labOrder.count({ where }),
    prisma.labOrder.findMany({
      where,
      orderBy: { orderedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { id: true, mrn: true, firstName: true, lastName: true, dateOfBirth: true } },
        orderingProvider: { select: { fullName: true, npi: true } },
      },
    }),
  ]);
  const role = req.auth!.role;
  const items = rows.map(({ patient, ...o }) => ({ ...o, patient: patient ? maskPatientForRole(patient, role) : null }));
  auditRead(req, { entityType: 'labOrders', entityId: ':list', action: 'GET /api/labs/orders' });
  return paged(items, page, pageSize, total);
}

export async function createOrder(req: Request, body: z.infer<typeof CreateOrderSchema>): Promise<unknown> {
  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true } });
  if (!patient) throw new ApiError(404, 'NOT_FOUND', `Patient ${body.patientId} not found`);
  let orderingProviderId = body.orderingProviderId;
  if (!orderingProviderId) {
    const provider = await prisma.provider.findFirst({ orderBy: { npi: 'asc' } });
    if (!provider) throw new ApiError(409, 'NO_PROVIDER', 'No provider available to attribute the order to');
    orderingProviderId = provider.id;
  }
  const order = await prisma.labOrder.create({
    data: {
      patientId: body.patientId,
      orderingProviderId,
      testCode: body.testCode.toUpperCase(),
      testName: body.testName,
      orderedAt: body.orderedAt ?? new Date(),
      status: 'ORDERED',
    },
  });
  return order;
}

export async function listResults(req: Request, query: z.infer<typeof ResultsQuerySchema>): Promise<Paged<unknown>> {
  const where: Record<string, unknown> = {};
  if (query.patientId) where.patientId = query.patientId;
  if (query.testCode) where.testCode = query.testCode.toUpperCase();
  if (query.status) where.status = query.status;
  if (query.abnormalOnly) where.abnormalFlag = { not: null };
  if (req.auth!.role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    where.patientId = own?.id ?? '__none__';
    where.status = { in: ['RELEASED', 'CORRECTED'] }; // patients only see released results
  }

  // TAT filters are computed (collectedAt→resultedAt) so they run in JS after
  // the fetch; we over-fetch then paginate — acceptable at demo scale.
  const rows = await prisma.labResult.findMany({
    where,
    orderBy: { collectedAt: 'desc' },
    take: 1000,
    include: {
      patient: { select: { id: true, mrn: true, firstName: true, lastName: true, dateOfBirth: true } },
      order: { select: { testName: true } },
    },
  });

  let filtered = rows;
  if (query.minTatHours !== undefined || query.maxTatHours !== undefined) {
    filtered = filtered.filter((r) => {
      const tat = tatHours(r);
      if (tat === null || tat < 0) return false;
      if (query.minTatHours !== undefined && tat < query.minTatHours) return false;
      if (query.maxTatHours !== undefined && tat > query.maxTatHours) return false;
      return true;
    });
  }

  const role = req.auth!.role;
  const { page, pageSize } = query;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(({ patient, ...r }) => ({
    ...r,
    tatHours: tatHours(r),
    patient: patient ? maskPatientForRole(patient, role) : null,
  }));
  auditRead(req, { entityType: 'labResults', entityId: ':list', action: 'GET /api/labs/results (PHI read)' });
  return paged(items, page, pageSize, filtered.length);
}

async function loadResult(id: string): Promise<{
  id: string;
  orderId: string;
  patientId: string;
  testCode: string;
  status: string;
  reviewedById: string | null;
  collectedAt: Date;
  resultedAt: Date | null;
  unit: string;
}> {
  const result = await prisma.labResult.findUnique({ where: { id } });
  if (!result) throw new ApiError(404, 'NOT_FOUND', `Lab result ${id} not found`);
  return result as never;
}

export async function reviewResult(req: Request, id: string): Promise<unknown> {
  const result = await loadResult(id);
  if (!REVIEWABLE_FROM.includes(result.status)) {
    throw new ApiError(409, 'INVALID_TRANSITION', `Cannot review a result in status ${result.status} (expected ${REVIEWABLE_FROM.join('/')})`);
  }
  const updated = await prisma.labResult.update({
    where: { id },
    data: { status: 'REVIEWED', reviewedAt: new Date(), reviewedById: req.auth!.userId },
  });
  return updated;
}

export async function releaseResult(req: Request, id: string): Promise<unknown> {
  const result = await loadResult(id);
  if (!RELEASABLE_FROM.includes(result.status)) {
    throw new ApiError(409, 'INVALID_TRANSITION', `Cannot release a result in status ${result.status} (expected REVIEWED — run /review first)`);
  }
  const now = new Date();
  const reviewer = result.reviewedById
    ? await prisma.user.findUnique({ where: { id: result.reviewedById }, select: { fullName: true, role: true } })
    : null;

  const updated = await prisma.labResult.update({
    where: { id },
    data: { status: 'RELEASED', releasedAt: now, reviewedById: result.reviewedById ?? req.auth!.userId },
  });

  const iso15189Note = [
    'AUTHORIZED RELEASE (ISO 15189 — post-examination release of patient results).',
    'Released only after authorized clinical review (SOP-LAB-002 "Laboratory Result Review and Release SOP", v2.1, EFFECTIVE).',
    reviewer ? `Reviewed by: ${reviewer.fullName} (${reviewer.role}).` : `Reviewed by user: ${result.reviewedById ?? 'n/a'}.`,
    `Released by: ${req.auth!.fullName} (${req.auth!.role}) at ${now.toISOString()}.`,
  ].join(' ');

  // CDC/EDC projection for downstream delivery (worker/webhook pipeline).
  await prisma.outboxEvent.create({
    data: {
      aggregateType: 'LabResult',
      aggregateId: id,
      eventType: 'lab.result.released',
      payload: {
        resultId: id,
        patientId: result.patientId,
        testCode: result.testCode,
        releasedAt: now.toISOString(),
        releasedBy: req.auth!.userId,
        delivery: { channel: 'PATIENT_PORTAL', status: 'pending' },
        iso15189: { document: 'SOP-LAB-002', note: iso15189Note },
      },
    },
  });
  // Secure test-result delivery attempt row (listed by /webhooks/outbound/deliveries).
  await prisma.outboxEvent.create({
    data: {
      aggregateType: 'OutboundDelivery',
      aggregateId: id,
      eventType: 'lab.result.delivery.pending',
      payload: {
        resultId: id,
        patientId: result.patientId,
        targetUrl: `/api/portal/results/${id}/download`,
        status: 'pending',
        attempts: 0,
        lastAttemptAt: null,
      },
    },
  });

  return { ...updated, iso15189ReleaseNote: iso15189Note };
}
