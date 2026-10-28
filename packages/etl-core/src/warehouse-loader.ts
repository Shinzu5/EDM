/**
 * Warehouse loader: idempotent upserts into the dimensional model.
 *
 * Facts have no natural-key unique constraint in the schema (by design — the
 * schema is frozen), so idempotency is achieved with DETERMINISTIC surrogate
 * ids derived from the natural key (e.g. fact id = uuid(claim_number)), which
 * we then `upsert` on. Dims that lack unique constraints (DimProvider,
 * DimLocation, DimPayer, DimPatient) are resolved findFirst-then-write keyed
 * on their natural columns (npi / code / goldenId).
 *
 * Golden patient resolution order:
 *   1. gov.MdmMaster mapping (mrn → goldenId) when MDM has run
 *   2. deterministic hash of normalized name + DOB (pre-MDM fallback)
 */
import type { Prisma, PrismaClient } from '@medidata/db';
import type { EtlContext, RawRow, WarehouseLoadResult } from './types.js';
import { deterministicUuid } from './checksum.js';
import { looseDobKey, looseName, pick } from './transforms/helpers.js';

// ---------------------------------------------------------------------------
// Small pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** YYYYMMDD integer key for warehouse.DimDate (UTC). */
export function dateKeyOf(date: Date): number {
  return Number(
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`,
  );
}

/** Deterministic golden id used before MDM has merged a patient. */
export function fallbackGoldenId(name: string, dob: string | null): string {
  return `golden-${deterministicUuid('fallback-golden', looseName(name), dob ?? '')}`;
}

export const KNOWN_PAYERS: Record<string, { name: string; type: string }> = {
  PHILHEALTH: { name: 'PhilHealth (Government)', type: 'GOVERNMENT' },
  MAXICARE: { name: 'Maxicare Healthcare', type: 'HMO' },
  MEDICARD: { name: 'Medicard Philippines', type: 'HMO' },
  'SELF-PAY': { name: 'Self-Paying Patient', type: 'SELF' },
};

export const KNOWN_LOINC: Record<string, string> = {
  HGB: '718-7',
  WBC: '6690-2',
  GLU: '2345-7',
  CREAT: '2160-0',
  HBA1C: '4548-4',
  CHOL: '2093-3',
  TSH: '3016-3',
  ALT: '1742-6',
};

// ---------------------------------------------------------------------------
// Dimension upserts
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

export async function ensureDimDate(tx: Tx, date: Date): Promise<boolean> {
  const dateKey = dateKeyOf(date);
  const existing = await tx.dimDate.findUnique({ where: { dateKey }, select: { dateKey: true } });
  if (existing) return false;
  const dow = date.getUTCDay();
  await tx.dimDate.create({
    data: {
      dateKey,
      fullDate: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
      year: date.getUTCFullYear(),
      quarter: Math.floor(date.getUTCMonth() / 3) + 1,
      month: date.getUTCMonth() + 1,
      week: Math.ceil(((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7),
      dayOfWeek: dow,
      isWeekend: dow === 0 || dow === 6,
    },
  });
  return true;
}

export async function upsertDimPayer(tx: Tx, code: string, name?: string | null, type?: string | null): Promise<string> {
  const known = KNOWN_PAYERS[code];
  const finalName = name?.trim() || known?.name || code;
  const finalType = type?.trim() || known?.type || 'UNKNOWN';
  const existing = await tx.dimPayer.findFirst({ where: { code }, select: { id: true } });
  if (existing) {
    await tx.dimPayer.update({ where: { id: existing.id }, data: { name: finalName, type: finalType } });
    return existing.id;
  }
  const created = await tx.dimPayer.create({ data: { code, name: finalName, type: finalType } });
  return created.id;
}

export async function upsertDimProvider(
  tx: Tx,
  p: { npi: string; fullName: string; specialty?: string | null; department?: string | null },
): Promise<string> {
  const data = { fullName: p.fullName, specialty: p.specialty ?? 'Unknown', department: p.department ?? 'Unknown' };
  const existing = await tx.dimProvider.findFirst({ where: { npi: p.npi }, select: { id: true } });
  if (existing) {
    await tx.dimProvider.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await tx.dimProvider.create({ data: { npi: p.npi, ...data } });
  return created.id;
}

export async function upsertDimLocation(tx: Tx, p: { code: string; name: string; type?: string | null }): Promise<string> {
  const data = { name: p.name, type: p.type ?? 'UNKNOWN' };
  const existing = await tx.dimLocation.findFirst({ where: { code: p.code }, select: { id: true } });
  if (existing) {
    await tx.dimLocation.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await tx.dimLocation.create({ data: { code: p.code, ...data } });
  return created.id;
}

export async function upsertDimTest(
  tx: Tx,
  p: { testCode: string; testName?: string | null; unit?: string | null },
): Promise<string> {
  const data = {
    testName: p.testName?.trim() || p.testCode,
    loincCode: KNOWN_LOINC[p.testCode] ?? null,
    unit: p.unit?.trim() || 'unitless',
    department: 'Laboratory',
  };
  await tx.dimTestCatalog.upsert({
    where: { testCode: p.testCode },
    update: data,
    create: { testCode: p.testCode, ...data },
  });
  return p.testCode;
}

export interface GoldenPatient {
  goldenId: string;
  mrn: string;
  fullName: string;
  dateOfBirth: Date;
  sex: string;
  city?: string | null;
  sourceCount: number;
}

/** Upsert the golden warehouse.DimPatient row for a golden id. */
export async function upsertDimPatient(tx: Tx, gp: GoldenPatient): Promise<string> {
  const data = {
    goldenId: gp.goldenId,
    mrn: gp.mrn,
    fullName: gp.fullName,
    dateOfBirth: gp.dateOfBirth,
    sex: gp.sex,
    city: gp.city ?? null,
    isGolden: true,
    sourceCount: gp.sourceCount,
  };
  const existing = await tx.dimPatient.findFirst({ where: { goldenId: gp.goldenId }, select: { id: true } });
  if (existing) {
    await tx.dimPatient.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await tx.dimPatient.create({ data });
  return created.id;
}

// ---------------------------------------------------------------------------
// Golden-id resolution (MDM mapping with hash fallback)
// ---------------------------------------------------------------------------

export async function loadMrnGoldenMap(tx: Prisma.TransactionClient | PrismaClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const masters = await tx.mdmMaster.findMany({ select: { goldenId: true, patientId: true } });
  if (masters.length === 0) return map;
  const patients = await tx.patient.findMany({ select: { id: true, mrn: true } });
  const mrnById = new Map(patients.map((p) => [p.id, p.mrn]));
  for (const m of masters) {
    const mrn = mrnById.get(m.patientId);
    if (mrn) map.set(mrn.toUpperCase(), m.goldenId);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main load
// ---------------------------------------------------------------------------

interface PatientGroup {
  goldenId: string;
  mrn: string;
  fullName: string;
  dob: string;
  sex: string;
  city: string | null;
  sources: Set<string>;
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function loadWarehouse(rows: RawRow[], ctx: EtlContext): Promise<WarehouseLoadResult> {
  const counts: WarehouseLoadResult = {
    dimPatients: 0,
    dimProviders: 0,
    dimLocations: 0,
    dimPayers: 0,
    dimDates: 0,
    dimTests: 0,
    factEncounters: 0,
    factLabResults: 0,
    factClaims: 0,
  };

  const goldenByMrn = await ctx.prisma.$transaction(async (tx) => loadMrnGoldenMap(tx));
  const patientGroups = new Map<string, PatientGroup>();

  await ctx.prisma.$transaction(async (tx) => {
    // --- Pass 1: collect + upsert patient dimension (golden rows) ----------
    for (const row of rows) {
      if (row.recordType !== 'patient') continue;
      const p = row.payload;
      const mrnRaw = pick(p, 'mrn');
      const mrn = typeof mrnRaw === 'string' && mrnRaw.trim() ? mrnRaw.trim().toUpperCase() : `LEGACY-${row.sourceRecordId}`;
      const first = String(pick(p, 'first_name') ?? '').trim();
      const last = String(pick(p, 'last_name') ?? '').trim();
      const fullName = `${first} ${last}`.trim() || String(pick(p, 'full_name') ?? 'UNKNOWN');
      const dobStr = typeof p.dob === 'string' ? p.dob : looseDobKey(pick(p, 'dob'));
      const dob = parseDateOnly(dobStr);
      if (!dob) continue; // business rule: no DOB → cannot dimension
      const goldenId = goldenByMrn.get(mrn) ?? fallbackGoldenId(fullName, dobStr ?? null);
      const key = `${goldenId}|${mrn}`;
      let g = patientGroups.get(key);
      if (!g) {
        g = {
          goldenId,
          mrn,
          fullName,
          dob: dobStr ?? '',
          sex: String(pick(p, 'sex') ?? 'UNKNOWN'),
          city: (pick(p, 'city') as string | null) ?? null,
          sources: new Set(),
        };
        patientGroups.set(key, g);
      }
      g.sources.add(row.sourceSystem);
    }

    // Collapse to one golden row per goldenId (survivor = most sources, then EMR).
    const byGolden = new Map<string, PatientGroup[]>();
    for (const g of patientGroups.values()) {
      const list = byGolden.get(g.goldenId) ?? [];
      list.push(g);
      byGolden.set(g.goldenId, list);
    }
    for (const [goldenId, list] of byGolden) {
      const survivor = [...list].sort(
        (a, b) =>
          b.sources.size - a.sources.size ||
          Number(b.sources.has('EMR')) - Number(a.sources.has('EMR')) ||
          a.mrn.localeCompare(b.mrn),
      )[0]!;
      await upsertDimPatient(tx, {
        goldenId,
        mrn: survivor.mrn,
        fullName: survivor.fullName,
        dateOfBirth: parseDateOnly(survivor.dob) ?? new Date(0),
        sex: survivor.sex,
        city: survivor.city,
        sourceCount: new Set(list.flatMap((g) => [...g.sources])).size,
      });
      counts.dimPatients += 1;
    }
    for (const g of patientGroups.values()) {
      const dob = parseDateOnly(g.dob);
      if (dob) {
        if (await ensureDimDate(tx, dob)) counts.dimDates += 1;
      }
    }

    // --- Pass 2: facts ------------------------------------------------------
    for (const row of rows) {
      const p = row.payload;
      const dimIdForMrn = async (mrnRaw: unknown): Promise<string | null> => {
        if (typeof mrnRaw !== 'string' || !mrnRaw.trim()) return null;
        const mrn = mrnRaw.trim().toUpperCase();
        const goldenId = goldenByMrn.get(mrn) ?? null;
        // Find the dim row via golden id, else via mrn column.
        const byGolden = goldenId
          ? await tx.dimPatient.findFirst({ where: { goldenId }, select: { id: true } })
          : null;
        if (byGolden) return byGolden.id;
        const byMrn = await tx.dimPatient.findFirst({ where: { mrn }, select: { id: true } });
        return byMrn?.id ?? null;
      };

      if (row.recordType === 'claim') {
        const patientKey = await dimIdForMrn(pick(p, 'mrn'));
        if (!patientKey) continue;
        const payerCode = String(pick(p, 'payer_code') ?? 'UNKNOWN').trim().toUpperCase();
        const payerKey = await upsertDimPayer(tx, payerCode);
        counts.dimPayers += 1;
        const submitted = parseDateOnly(String(pick(p, 'submitted_at') ?? '').slice(0, 10)) ?? new Date(0);
        if (await ensureDimDate(tx, submitted)) counts.dimDates += 1;
        const billed = typeof p.billed_amount === 'number' ? p.billed_amount : 0;
        const paid = typeof p.paid_amount === 'number' ? p.paid_amount : null;
        const paidAt = typeof p.paid_at === 'string' ? new Date(p.paid_at) : null;
        const daysToPayment =
          paidAt && !Number.isNaN(paidAt.getTime())
            ? Math.round(((paidAt.getTime() - submitted.getTime()) / 86_400_000) * 100) / 100
            : null;
        const id = deterministicUuid('fact-claim', row.sourceRecordId);
        await tx.factClaim.upsert({
          where: { id },
          update: {
            patientKey,
            payerKey,
            dateKey: dateKeyOf(submitted),
            claimStatus: String(pick(p, 'status') ?? 'PENDING'),
            billedAmount: billed,
            paidAmount: paid,
            daysToPayment,
          },
          create: {
            id,
            patientKey,
            payerKey,
            dateKey: dateKeyOf(submitted),
            claimStatus: String(pick(p, 'status') ?? 'PENDING'),
            billedAmount: billed,
            paidAmount: paid,
            daysToPayment,
          },
        });
        counts.factClaims += 1;
      } else if (row.recordType === 'lab_result') {
        const patientKey = await dimIdForMrn(pick(p, 'emr_mrn', 'mrn'));
        if (!patientKey) continue;
        const testCode = String(pick(p, 'test_code') ?? '').trim().toUpperCase();
        if (!testCode) continue;
        const testKey = await upsertDimTest(tx, {
          testCode,
          testName: (pick(p, 'test_name') as string | null) ?? null,
          unit: (pick(p, 'unit') as string | null) ?? null,
        });
        counts.dimTests += 1;
        const collected =
          parseDateOnly(String(pick(p, 'collected_at') ?? '').slice(0, 10)) ??
          parseDateOnly(String(pick(p, 'ordered_at') ?? '').slice(0, 10)) ??
          new Date(0);
        if (await ensureDimDate(tx, collected)) counts.dimDates += 1;
        const id = deterministicUuid('fact-lab-result', row.sourceRecordId);
        const valueNumeric = typeof p.valueNumeric === 'number' ? p.valueNumeric : null;
        const tatHours = typeof p.tatHours === 'number' ? p.tatHours : null;
        const abnormalFlag = typeof p.abnormal_flag === 'string' ? p.abnormal_flag : null;
        await tx.factLabResult.upsert({
          where: { id },
          update: { patientKey, testKey, dateKey: dateKeyOf(collected), valueNumeric, abnormalFlag, tatHours },
          create: { id, patientKey, testKey, dateKey: dateKeyOf(collected), valueNumeric, abnormalFlag, tatHours },
        });
        counts.factLabResults += 1;
      } else if (row.recordType === 'insurance_policy') {
        const payerCode = String(pick(p, 'payer_code') ?? '').trim().toUpperCase();
        if (payerCode) {
          await upsertDimPayer(tx, payerCode);
          counts.dimPayers += 1;
        }
      } else if (row.recordType === 'encounter') {
        const patientKey = await dimIdForMrn(pick(p, 'mrn'));
        if (!patientKey) continue;
        const providerKey = await upsertDimProvider(tx, {
          npi: String(pick(p, 'provider_npi') ?? 'UNKNOWN'),
          fullName: String(pick(p, 'provider_name') ?? 'Unknown'),
          specialty: (pick(p, 'provider_specialty') as string | null) ?? null,
          department: (pick(p, 'provider_department') as string | null) ?? null,
        });
        counts.dimProviders += 1;
        const locationKey = await upsertDimLocation(tx, {
          code: String(pick(p, 'location_code') ?? 'UNKNOWN'),
          name: String(pick(p, 'location_name') ?? 'Unknown'),
          type: (pick(p, 'location_type') as string | null) ?? null,
        });
        counts.dimLocations += 1;
        const admitted = parseDateOnly(String(pick(p, 'admitted_at') ?? '').slice(0, 10)) ?? new Date(0);
        if (await ensureDimDate(tx, admitted)) counts.dimDates += 1;
        const id = deterministicUuid('fact-encounter', row.sourceRecordId);
        const losDays = typeof p.losDays === 'number' ? p.losDays : null;
        const chargeAmount = typeof p.chargeAmount === 'number' ? p.chargeAmount : null;
        const data = {
          patientKey,
          providerKey,
          locationKey,
          dateKey: dateKeyOf(admitted),
          encounterType: String(pick(p, 'type') ?? 'OUTPATIENT'),
          status: String(pick(p, 'status') ?? 'UNKNOWN'),
          losDays,
          chargeAmount,
          diagnosisCode: String(pick(p, 'diagnosis_code') ?? ''),
        };
        await tx.factEncounter.upsert({ where: { id }, update: data, create: { id, ...data } });
        counts.factEncounters += 1;
      }
    }
  });

  return counts;
}

// ---------------------------------------------------------------------------
// app.* -> warehouse projection (operational store and CDC syncs)
// ---------------------------------------------------------------------------

/** Ensure the golden DimPatient row exists for one app.Patient. */
export async function syncPatientToWarehouse(patientId: string, ctx: EtlContext): Promise<void> {
  const patient = await ctx.prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return;
  const goldenByMrn = await ctx.prisma.$transaction((tx) => loadMrnGoldenMap(tx));
  const goldenId =
    goldenByMrn.get(patient.mrn.toUpperCase()) ??
    fallbackGoldenId(`${patient.firstName} ${patient.lastName}`, patient.dateOfBirth.toISOString().slice(0, 10));
  await ctx.prisma.$transaction((tx) =>
    upsertDimPatient(tx, {
      goldenId,
      mrn: patient.mrn,
      fullName: `${patient.firstName} ${patient.lastName}`.trim(),
      dateOfBirth: patient.dateOfBirth,
      sex: patient.sex,
      city: patient.city,
      sourceCount: 1,
    }),
  );
}

/**
 * Project every app.Patient + app.Encounter into the warehouse. This is the
 * "operational store -> warehouse" leg that populates FactEncounter (the
 * siloed file feeds carry no encounters) and guarantees DimPatient coverage
 * for facts projected later by CDC.
 */
export async function loadWarehouseFromApp(ctx: EtlContext): Promise<{ patients: number; encounters: number }> {
  const goldenByMrn = await ctx.prisma.$transaction((tx) => loadMrnGoldenMap(tx));
  const result = { patients: 0, encounters: 0 };

  await ctx.prisma.$transaction(async (tx) => {
    const patients = await tx.patient.findMany();
    const byGolden = new Map<string, typeof patients>();
    for (const p of patients) {
      const goldenId =
        goldenByMrn.get(p.mrn.toUpperCase()) ??
        fallbackGoldenId(`${p.firstName} ${p.lastName}`, p.dateOfBirth.toISOString().slice(0, 10));
      const list = byGolden.get(goldenId) ?? [];
      list.push(p);
      byGolden.set(goldenId, list);
    }
    const dimIdByPatientId = new Map<string, string>();
    for (const [goldenId, list] of byGolden) {
      const survivor = [...list].sort(
        (a, b) => Number(b.sourceSystem === 'EMR') - Number(a.sourceSystem === 'EMR') || a.mrn.localeCompare(b.mrn),
      )[0]!;
      const dimId = await upsertDimPatient(tx, {
        goldenId,
        mrn: survivor.mrn,
        fullName: `${survivor.firstName} ${survivor.lastName}`.trim(),
        dateOfBirth: survivor.dateOfBirth,
        sex: survivor.sex,
        city: survivor.city,
        sourceCount: new Set(list.map((p) => p.sourceSystem)).size || list.length,
      });
      for (const p of list) dimIdByPatientId.set(p.id, dimId);
      result.patients += 1;
    }

    const encounters = await tx.encounter.findMany({
      include: {
        provider: true,
        location: true,
        claims: { select: { billedAmount: true } },
      },
    });
    for (const e of encounters) {
      const patientKey = dimIdByPatientId.get(e.patientId);
      if (!patientKey) continue;
      const providerKey = await upsertDimProvider(tx, {
        npi: e.provider.npi,
        fullName: e.provider.fullName,
        specialty: e.provider.specialty,
        department: e.provider.department,
      });
      const locationKey = await upsertDimLocation(tx, {
        code: e.location.code,
        name: e.location.name,
        type: e.location.type,
      });
      await ensureDimDate(tx, e.admittedAt);
      const charge = e.claims.reduce((sum, c) => sum + Number(c.billedAmount), 0);
      const losDays =
        e.dischargedAt === null
          ? null
          : Math.round(((e.dischargedAt.getTime() - e.admittedAt.getTime()) / 86_400_000) * 100) / 100;
      const id = deterministicUuid('fact-encounter', e.id);
      const data = {
        patientKey,
        providerKey,
        locationKey,
        dateKey: dateKeyOf(e.admittedAt),
        encounterType: e.type,
        status: e.status,
        losDays,
        chargeAmount: charge,
        diagnosisCode: e.diagnosisCode,
      };
      await tx.factEncounter.upsert({ where: { id }, update: data, create: { id, ...data } });
      result.encounters += 1;
    }
  });

  return result;
}

/** CDC projection: one claim (by id) -> FactClaim. */
export async function syncClaimToWarehouse(claimId: string, ctx: EtlContext): Promise<void> {
  const claim = await ctx.prisma.claim.findUnique({
    where: { id: claimId },
    include: { patient: { select: { mrn: true } }, payer: { select: { code: true } } },
  });
  if (!claim) return;
  await syncPatientToWarehouse(claim.patientId, ctx);
  const row: RawRow = {
    sourceSystem: 'BILLING',
    recordType: 'claim',
    sourceRecordId: claim.claimNumber,
    payload: {
      claim_number: claim.claimNumber,
      mrn: claim.patient.mrn,
      payer_code: claim.payer.code,
      billed_amount: Number(claim.billedAmount),
      paid_amount: claim.paidAmount === null ? null : Number(claim.paidAmount),
      status: claim.status,
      submitted_at: claim.submittedAt.toISOString(),
      paid_at: claim.paidAt ? claim.paidAt.toISOString() : null,
    },
  };
  await loadWarehouse([row], ctx);
}

/** CDC projection: one encounter (by id) -> FactEncounter. */
export async function syncEncounterToWarehouse(encounterId: string, ctx: EtlContext): Promise<void> {
  const e = await ctx.prisma.encounter.findUnique({
    where: { id: encounterId },
    include: {
      patient: { select: { mrn: true } },
      provider: true,
      location: true,
      claims: { select: { billedAmount: true } },
    },
  });
  if (!e) return;
  await syncPatientToWarehouse(e.patientId, ctx);
  const row: RawRow = {
    sourceSystem: 'EMR',
    recordType: 'encounter',
    sourceRecordId: e.id,
    payload: {
      mrn: e.patient.mrn,
      type: e.type,
      status: e.status,
      admitted_at: e.admittedAt.toISOString(),
      discharged_at: e.dischargedAt ? e.dischargedAt.toISOString() : null,
      diagnosis_code: e.diagnosisCode,
      provider_npi: e.provider.npi,
      provider_name: e.provider.fullName,
      provider_specialty: e.provider.specialty,
      provider_department: e.provider.department,
      location_code: e.location.code,
      location_name: e.location.name,
      location_type: e.location.type,
      chargeAmount: e.claims.reduce((sum, c) => sum + Number(c.billedAmount), 0),
      losDays:
        e.dischargedAt === null
          ? null
          : Math.round(((e.dischargedAt.getTime() - e.admittedAt.getTime()) / 86_400_000) * 100) / 100,
    },
  };
  await loadWarehouse([row], ctx);
}
