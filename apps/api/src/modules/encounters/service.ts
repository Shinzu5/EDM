/**
 * Encounters — list with filters (patient, type, status, admittedAt range).
 * Patient identity is masked for ANALYST/BILLER.
 */
import { prisma } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import { paged, type Paged } from '../../lib/envelope.js';
import { resolvePatientForUser } from '../../lib/patientScope.js';
import { auditRead } from '../../middleware/audit.js';
import { maskPatientForRole, maskName } from '../../middleware/masking.js';

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  patientId: z.string().optional(),
  type: z.enum(['INPATIENT', 'OUTPATIENT', 'EMERGENCY', 'TELEHEALTH']).optional(),
  status: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function listEncounters(req: Request, query: z.infer<typeof ListQuerySchema>): Promise<Paged<unknown>> {
  const role = req.auth!.role;
  const where: Record<string, unknown> = {};
  if (query.patientId) where.patientId = query.patientId;
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.admittedAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    where.patientId = own?.id ?? '__none__';
  }

  const { page, pageSize } = query;
  const [total, rows] = await Promise.all([
    prisma.encounter.count({ where }),
    prisma.encounter.findMany({
      where,
      orderBy: { admittedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { id: true, mrn: true, firstName: true, lastName: true, dateOfBirth: true } },
        provider: { select: { fullName: true, npi: true } },
        location: { select: { name: true, code: true } },
      },
    }),
  ]);

  const items = rows.map((e) => {
    const { patient, ...rest } = e;
    return {
      ...rest,
      patient: patient ? maskPatientForRole(patient, role) : null,
      patientDisplay: patient ? maskName(patient.firstName, patient.lastName).fullName : null,
    };
  });

  auditRead(req, { entityType: 'encounters', entityId: ':list', action: 'GET /api/encounters (PHI read)' });
  return paged(items, page, pageSize, total);
}
