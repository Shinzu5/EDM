/**
 * FHIR R4-shaped read endpoints (searchset Bundles) over the app schema.
 * Content-Type: application/fhir+json. `?_format=json` is accepted; XML is
 * OUT OF SCOPE (a `_format=xml` request returns a 400 OperationOutcome).
 * Common params: `_count` (default 50, max 200), `patient` (id or MRN).
 */
import { prisma } from '@medidata/db';
import { API_BASE } from '@medidata/shared';
import { ApiError } from '../lib/envelope.js';
import { dec } from '../lib/serialize.js';

const DEFAULT_COUNT = 50;
const MAX_COUNT = 200;

export interface SearchParams {
  count: number;
  patientRef?: string;
  status?: string;
  format?: string;
}

export function parseSearchParams(query: Record<string, unknown>): SearchParams {
  const rawCount = Number(query._count ?? DEFAULT_COUNT);
  const params: SearchParams = {
    count: Number.isFinite(rawCount) ? Math.min(Math.max(1, rawCount), MAX_COUNT) : DEFAULT_COUNT,
  };
  if (typeof query.patient === 'string' && query.patient) params.patientRef = query.patient;
  if (typeof query.status === 'string' && query.status) params.status = query.status.toUpperCase();
  const format = typeof query._format === 'string' ? query._format.toLowerCase() : undefined;
  if (format && !['json', 'application/fhir+json'].includes(format)) {
    throw new ApiError(400, 'UNSUPPORTED_FORMAT', 'Only _format=json is supported (XML is out of scope for this project)');
  }
  params.format = format;
  return params;
}

function bundle(resourceType: string, resources: Array<{ id: string } & Record<string, unknown>>): unknown {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((resource) => ({
      fullUrl: `${API_BASE}/fhir/${resourceType}/${resource.id}`,
      resource: { resourceType, ...resource },
    })),
  };
}

/** Resolve `patient` param (id or MRN) → patient id filter. */
async function patientFilter(ref?: string): Promise<string[] | undefined> {
  if (!ref) return undefined;
  const byId = await prisma.patient.findUnique({ where: { id: ref }, select: { id: true } });
  if (byId) return [byId.id];
  const byMrn = await prisma.patient.findUnique({ where: { mrn: ref }, select: { id: true } });
  if (byMrn) return [byMrn.id];
  return ['__none__'];
}

const GENDER: Record<string, string> = { MALE: 'male', FEMALE: 'female', OTHER: 'other', UNKNOWN: 'unknown' };

export async function searchPatients(params: SearchParams): Promise<unknown> {
  const ids = await patientFilter(params.patientRef);
  const rows = await prisma.patient.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    take: params.count,
    orderBy: { mrn: 'asc' },
  });
  const resources = rows.map((p) => ({
    id: p.id,
    identifier: [{ use: 'usual', system: 'http://medidata.local/mrn', value: p.mrn }],
    name: [{ use: 'official', family: p.lastName, given: [p.firstName] }],
    gender: GENDER[p.sex] ?? 'unknown',
    birthDate: p.dateOfBirth.toISOString().slice(0, 10),
    address: p.address || p.city ? [{ line: p.address ? [p.address] : undefined, city: p.city ?? undefined, country: 'PH' }] : undefined,
    telecom: p.phone ? [{ system: 'phone', value: p.phone }] : undefined,
  }));
  return bundle('Patient', resources);
}

const ENC_STATUS: Record<string, string> = {
  ACTIVE: 'in-progress',
  DISCHARGED: 'finished',
  COMPLETED: 'finished',
  CANCELLED: 'cancelled',
};

export async function searchEncounters(params: SearchParams): Promise<unknown> {
  const ids = await patientFilter(params.patientRef);
  const rows = await prisma.encounter.findMany({
    where: ids ? { patientId: { in: ids } } : undefined,
    take: params.count,
    orderBy: { admittedAt: 'desc' },
  });
  const resources = rows.map((e) => ({
    id: e.id,
    status: ENC_STATUS[e.status.toUpperCase()] ?? 'unknown',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: e.type, display: e.type },
    type: [{ coding: [{ system: 'http://medidata.local/encounter-type', code: e.type, display: e.type }] }],
    subject: { reference: `Patient/${e.patientId}` },
    period: { start: e.admittedAt.toISOString(), end: e.dischargedAt?.toISOString() ?? undefined },
    diagnosis: [{ condition: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: e.diagnosisCode, display: e.diagnosisText }] } }],
  }));
  return bundle('Encounter', resources);
}

const OBS_STATUS: Record<string, string> = {
  COLLECTED: 'registered',
  IN_PROGRESS: 'preliminary',
  REVIEWED: 'final',
  RELEASED: 'final',
  CORRECTED: 'corrected',
};

const INTERPRETATION: Record<string, string> = { H: 'H', L: 'L', A: 'A', N: 'N' };

export async function searchObservations(params: SearchParams): Promise<unknown> {
  const ids = await patientFilter(params.patientRef);
  const where: Record<string, unknown> = {};
  if (ids) where.patientId = { in: ids };
  if (params.status) where.status = params.status;
  const rows = await prisma.labResult.findMany({
    where,
    take: params.count,
    orderBy: { collectedAt: 'desc' },
    include: { order: { select: { testName: true } } },
  });
  const resources = rows.map((r) => ({
    id: r.id,
    status: OBS_STATUS[r.status] ?? 'unknown',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
    code: {
      coding: [{ system: 'http://loinc.org', code: r.testCode, display: r.order?.testName ?? r.testCode }],
      text: r.order?.testName ?? r.testCode,
    },
    subject: { reference: `Patient/${r.patientId}` },
    ...(r.valueNumeric !== null
      ? { valueQuantity: { value: r.valueNumeric, unit: r.unit, system: 'http://unitsofmeasure.org', code: r.unit } }
      : { valueString: r.valueText ?? undefined }),
    ...(r.abnormalFlag && INTERPRETATION[r.abnormalFlag]
      ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: INTERPRETATION[r.abnormalFlag] }] }] }
      : {}),
    referenceRange: [{ text: r.referenceRange }],
    effectiveDateTime: (r.resultedAt ?? r.collectedAt).toISOString(),
    ...(r.releasedAt ? { issued: r.releasedAt.toISOString() } : {}),
  }));
  return bundle('Observation', resources);
}

const CLAIM_STATUS: Record<string, string> = {
  DRAFT: 'draft',
  SUBMITTED: 'active',
  PENDING: 'active',
  PAID: 'finished',
  DENIED: 'cancelled',
  APPEALED: 'active',
};

export async function searchClaims(params: SearchParams): Promise<unknown> {
  const ids = await patientFilter(params.patientRef);
  const where: Record<string, unknown> = {};
  if (ids) where.patientId = { in: ids };
  if (params.status) where.status = params.status;
  const rows = await prisma.claim.findMany({
    where,
    take: params.count,
    orderBy: { submittedAt: 'desc' },
    include: { payer: { select: { name: true } } },
  });
  const resources = rows.map((c) => ({
    id: c.id,
    status: CLAIM_STATUS[c.status] ?? 'unknown',
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/ex-claimtype', code: 'professional', display: 'Professional' }] },
    use: 'claim',
    patient: { reference: `Patient/${c.patientId}` },
    insurer: { display: c.payer.name },
    created: c.submittedAt.toISOString(),
    provider: { identifier: { system: 'http://medidata.local/claim', value: c.claimNumber } },
    total: [{ category: { text: 'Total' }, amount: { value: dec(c.billedAmount) ?? 0, currency: 'PHP' } }],
  }));
  return bundle('Claim', resources);
}
