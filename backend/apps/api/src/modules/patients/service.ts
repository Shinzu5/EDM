/**
 * Patients — paginated search (name/MRN, role-masked) + Patient360 aggregate
 * ("Customer 360° View"): patient + encounters + lab results + claims +
 * insurance policies + consents.
 */
import { prisma, type Patient } from '@medidata/db';
import type { Request } from 'express';
import { z } from 'zod';
import type { Role } from '@medidata/shared';
import { decryptFieldSafe } from '../../lib/crypto.js';
import { ApiError, paged, type Paged } from '../../lib/envelope.js';
import { resolvePatientForUser } from '../../lib/patientScope.js';
import { dec } from '../../lib/serialize.js';
import { auditRead } from '../../middleware/audit.js';
import { maskPatientForRole, shouldMask } from '../../middleware/masking.js';
import { derivePoliciesForPatients } from '../insurance/service.js';

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});

export interface PatientListItem {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  fullNameNormalized: string;
  dateOfBirth: Date | string;
  sex: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  sourceSystem: string;
  createdAt: Date;
  encounterCount: number;
  lastEncounterAt: Date | null;
  openClaimCount: number;
  ssn?: string | null;
  masked?: true;
}

const OPEN_CLAIM_STATUSES = ['DRAFT', 'SUBMITTED', 'PENDING', 'DENIED', 'APPEALED'] as const;

/** Roles allowed to see the decrypted SSN (spec: physician/admin/self). */
function canSeeSsn(role: Role, patientId: string, req: Request): boolean {
  if (role === 'PATIENT') return false; // self-SSN handled by portal scope; keep list clean
  return role === 'ADMIN' || role === 'PHYSICIAN' || patientId === req.auth?.userId;
}

export async function listPatients(req: Request, query: z.infer<typeof ListQuerySchema>): Promise<Paged<PatientListItem>> {
  const { page, pageSize, q } = query;
  const role = req.auth!.role;

  const where: Record<string, unknown> = {};
  if (q) {
    // Prisma `contains`+mode-insensitive → ILIKE with wildcards escaped by
    // Prisma itself (pg_trgm-safe: plain substring match, no trigram config
    // required on the DB).
    where.OR = [
      { mrn: { contains: q, mode: 'insensitive' } },
      { fullNameNormalized: { contains: q.toUpperCase(), mode: 'insensitive' } },
    ];
  }
  // PATIENT role: self-scope to their own record only.
  if (role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    where.id = own?.id ?? '__none__';
  }

  const [total, rows] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: { lastName: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        mrn: true,
        firstName: true,
        lastName: true,
        fullNameNormalized: true,
        dateOfBirth: true,
        sex: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        sourceSystem: true,
        createdAt: true,
        ssnEncrypted: true,
        _count: { select: { encounters: true } },
      },
    }),
  ]);

  const ids = rows.map((r) => r.id);
  const [openClaims, encounters] = ids.length
    ? await Promise.all([
        prisma.claim.findMany({
          where: { patientId: { in: ids }, status: { in: [...OPEN_CLAIM_STATUSES] } },
          select: { patientId: true },
        }),
        prisma.encounter.findMany({
          where: { patientId: { in: ids } },
          orderBy: { admittedAt: 'desc' },
          select: { patientId: true, admittedAt: true },
        }),
      ])
    : [[], []];

  const openByPatient = new Map<string, number>();
  for (const c of openClaims) openByPatient.set(c.patientId, (openByPatient.get(c.patientId) ?? 0) + 1);
  const lastByPatient = new Map<string, Date>();
  for (const e of encounters) if (!lastByPatient.has(e.patientId)) lastByPatient.set(e.patientId, e.admittedAt);

  const items: PatientListItem[] = rows.map((r) => {
    const base = {
      id: r.id,
      mrn: r.mrn,
      firstName: r.firstName,
      lastName: r.lastName,
      fullNameNormalized: r.fullNameNormalized,
      dateOfBirth: r.dateOfBirth,
      sex: r.sex,
      phone: r.phone,
      email: r.email,
      address: r.address,
      city: r.city,
      sourceSystem: r.sourceSystem,
      createdAt: r.createdAt,
      encounterCount: r._count.encounters,
      lastEncounterAt: lastByPatient.get(r.id) ?? null,
      openClaimCount: openByPatient.get(r.id) ?? 0,
    };
    const item = canSeeSsn(role, r.id, req) ? { ...base, ssn: decryptFieldSafe(r.ssnEncrypted) } : base;
    return maskPatientForRole(item, role) as PatientListItem;
  });

  auditRead(req, { entityType: 'patients', entityId: ':list', action: 'GET /api/patients (PHI read)' });
  return paged(items, page, pageSize, total);
}

export interface Patient360Payload {
  patient: Record<string, unknown>;
  encounters: unknown[];
  labResults: unknown[];
  claims: unknown[];
  insurance: unknown[];
  consents: unknown[];
}

export async function patient360(req: Request, id: string): Promise<Patient360Payload> {
  const role = req.auth!.role;

  let patient: Patient | null = await prisma.patient.findUnique({ where: { id } });
  // Portal users may address their record by MRN as a convenience.
  if (!patient && role === 'PATIENT') patient = await prisma.patient.findUnique({ where: { mrn: id } });
  if (!patient) throw new ApiError(404, 'NOT_FOUND', `Patient ${id} not found`);

  if (role === 'PATIENT') {
    const own = await resolvePatientForUser(req.auth!);
    if (!own || own.id !== patient.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Patients may only access their own record');
    }
  }

  const [encounters, labResults, claims, consents] = await Promise.all([
    prisma.encounter.findMany({
      where: { patientId: patient.id },
      orderBy: { admittedAt: 'desc' },
      include: { provider: { select: { fullName: true, npi: true } }, location: { select: { name: true } } },
    }),
    prisma.labResult.findMany({ where: { patientId: patient.id }, orderBy: { collectedAt: 'desc' } }),
    prisma.claim.findMany({
      where: { patientId: patient.id },
      orderBy: { submittedAt: 'desc' },
      include: { payer: { select: { code: true, name: true } } },
    }),
    prisma.consent.findMany({ where: { patientId: patient.id }, orderBy: { grantedAt: 'desc' } }),
  ]);
  const insurance = await derivePoliciesForPatients([patient.id]);

  const patientOut: Record<string, unknown> = { ...maskPatientForRole(patient as never, role) } as Record<string, unknown>;
  if (!shouldMask(role)) {
    patientOut.ssn = decryptFieldSafe(patient.ssnEncrypted);
    delete patientOut.ssnEncrypted;
  } else {
    delete patientOut.ssnEncrypted;
  }

  auditRead(req, { entityType: 'patient360', entityId: patient.id, action: 'GET /api/patients/:id (PHI read)' });

  return {
    patient: patientOut,
    encounters,
    labResults,
    claims: claims.map((c) => ({
      ...c,
      billedAmount: dec(c.billedAmount),
      paidAmount: dec(c.paidAmount),
    })),
    insurance,
    consents,
  };
}
