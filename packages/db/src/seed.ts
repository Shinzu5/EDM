/**
 * Synthetic data seeder — NO REAL PHI. Everything here is machine-generated.
 *
 * Run: `npm run seed` (from repo root) or `npm run seed -w @medidata/db`.
 * Idempotent: wipes app/staging/warehouse/gov tables in FK-safe order, then
 * re-creates deterministic synthetic data (seeded PRNG — same data every run).
 *
 * Also writes fixture files under <repo-root>/fixtures/ that simulate the
 * siloed source systems (EMR, LIS, Billing, Insurance, Legacy CSV, HL7).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import {
  Classification,
  ClaimStatus,
  EncounterType,
  Prisma,
  ResultStatus,
  Severity,
  Sex,
  SourceSystem,
  UserRole,
} from '@prisma/client';
import { prisma } from './index.js';

// ---------------------------------------------------------------------------
// Guard: only run with a DATABASE_URL
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  console.error(
    '\n[seed] ERROR: DATABASE_URL is not set.\n' +
      '[seed] Copy .env.example to .env, create a free Neon project, and set\n' +
      '[seed] DATABASE_URL (pooled) and DIRECT_URL before running `npm run seed`.\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — no extra deps
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240517);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function int(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function dateBetween(start: Date, end: Date): Date {
  return new Date(start.getTime() + rand() * (end.getTime() - start.getTime()));
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600_000);
}

function addDays(d: Date, days: number): Date {
  return addHours(d, days * 24);
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Ana', 'Miguel', 'Angelica', 'Rafael', 'Sofia',
  'Andres', 'Isabela', 'Paolo', 'Camille', 'Reynaldo', 'Teresita', 'Jomar',
  'Kristine', 'Alfredo', 'Marilou', 'Bernardo', 'Grace', 'Dennis', 'Lorna',
  'Kevin', 'Charmaine', 'Rodel', 'Precious', 'Nestor', 'Shaina', 'Emilio',
  'Farah', 'Lucas', 'Hannah', 'Omar', 'Divina', 'Gerald', 'Yumi', 'Samuel',
  'Bianca', 'Ramón', 'Ayesha',
];

const LAST_NAMES = [
  'Dela Cruz', 'Santos', 'Reyes', 'Bautista', 'Mendoza', 'Garcia', 'Villanueva',
  'Aquino', 'Navarro', 'Flores', 'Castillo', 'Mercado', 'Ocampo', 'Ramos',
  'Salazar', 'Panganiban', 'Lim', 'Tan', 'Chua', 'Abadilla', 'Dizon', 'Escobar',
  'Fajardo', 'Gonzales', 'Hernandez', 'Ignacio', 'Jimenez', 'Katigbak', 'Lopez',
  'Manalo',
];

const CITIES = ['Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Makati', 'Pasig', 'Iloilo City', 'Baguio'];

const SPECIALTIES = ['Internal Medicine', 'Pediatrics', 'Cardiology', 'Obstetrics', 'Surgery', 'Family Medicine', 'Radiology', 'Pathology'];

const PROVIDERS: Array<{ npi: string; fullName: string; specialty: string; department: string }> = [
  { npi: '1093817465', fullName: 'Dr. Elena Ramos', specialty: 'Internal Medicine', department: 'Medicine' },
  { npi: '1275938461', fullName: 'Dr. Miguel Bautista', specialty: 'Cardiology', department: 'Medicine' },
  { npi: '1483920574', fullName: 'Dr. Sophia Lim', specialty: 'Pediatrics', department: 'Pediatrics' },
  { npi: '1667749283', fullName: 'Dr. Rafael Ocampo', specialty: 'Surgery', department: 'Surgery' },
  { npi: '1780293645', fullName: 'Dr. Angelica Tan', specialty: 'Obstetrics', department: 'OB-GYNE' },
  { npi: '1841650293', fullName: 'Dr. Nestor Chua', specialty: 'Family Medicine', department: 'Outpatient' },
  { npi: '1928374650', fullName: 'Dr. Grace Navarro', specialty: 'Radiology', department: 'Imaging' },
  { npi: '1357294680', fullName: 'Dr. Omar Abdulaziz', specialty: 'Pathology', department: 'Laboratory' },
];

const LOCATIONS = [
  { code: 'MN-IP-3F', name: 'Manila General — Ward 3F', type: 'INPATIENT_WARD' },
  { code: 'MN-ED-01', name: 'Manila General — Emergency', type: 'EMERGENCY' },
  { code: 'QC-OPD-2', name: 'Quezon City Outpatient Clinic', type: 'OUTPATIENT_CLINIC' },
  { code: 'CEB-TH-01', name: 'Cebu Telehealth Hub', type: 'TELEHEALTH' },
];

const PAYERS = [
  { code: 'PHILHEALTH', name: 'PhilHealth (Government)', type: 'GOVERNMENT' },
  { code: 'MAXICARE', name: 'Maxicare Healthcare', type: 'HMO' },
  { code: 'MEDICARD', name: 'Medicard Philippines', type: 'HMO' },
  { code: 'SELF-PAY', name: 'Self-Paying Patient', type: 'SELF' },
];

const TEST_CATALOG = [
  { testCode: 'HGB', testName: 'Hemoglobin', loincCode: '718-7', unit: 'g/dL', refLow: 12.0, refHigh: 17.0, refRange: '12.0-17.0' },
  { testCode: 'WBC', testName: 'White Blood Cell Count', loincCode: '6690-2', unit: '10e3/uL', refLow: 4.0, refHigh: 11.0, refRange: '4.0-11.0' },
  { testCode: 'GLU', testName: 'Glucose, Fasting', loincCode: '2345-7', unit: 'mg/dL', refLow: 70, refHigh: 110, refRange: '70-110' },
  { testCode: 'CREAT', testName: 'Creatinine', loincCode: '2160-0', unit: 'mg/dL', refLow: 0.6, refHigh: 1.3, refRange: '0.6-1.3' },
  { testCode: 'HBA1C', testName: 'Hemoglobin A1c', loincCode: '4548-4', unit: '%', refLow: 4.0, refHigh: 5.6, refRange: '4.0-5.6' },
  { testCode: 'CHOL', testName: 'Total Cholesterol', loincCode: '2093-3', unit: 'mg/dL', refLow: 0, refHigh: 200, refRange: '<200' },
  { testCode: 'TSH', testName: 'Thyroid Stimulating Hormone', loincCode: '3016-3', unit: 'mIU/L', refLow: 0.4, refHigh: 4.0, refRange: '0.4-4.0' },
  { testCode: 'ALT', testName: 'Alanine Aminotransferase', loincCode: '1742-6', unit: 'U/L', refLow: 7, refHigh: 56, refRange: '7-56' },
] as const;

const DIAGNOSES = [
  { code: 'J18.9', text: 'Pneumonia, unspecified organism' },
  { code: 'E11.9', text: 'Type 2 diabetes mellitus without complications' },
  { code: 'I10', text: 'Essential (primary) hypertension' },
  { code: 'N39.0', text: 'Urinary tract infection, site not specified' },
  { code: 'K29.7', text: 'Gastritis, unspecified' },
  { code: 'M54.5', text: 'Low back pain' },
  { code: 'O80', text: 'Encounter for full-term uncomplicated delivery' },
  { code: 'S52.501A', text: 'Unspecified fracture of lower end of right radius, initial encounter' },
];

const CONSENT_TYPES = ['DATA_SHARING', 'TELEHEALTH_CARE', 'MARKETING_OPT_OUT'];

const YEAR_START = new Date('2024-01-01T00:00:00Z');
const YEAR_END = new Date('2024-12-31T23:59:59Z');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('[seed] Clearing tables (FK-safe order)…');

  // gov → staging → warehouse → app (children before parents inside each)
  await prisma.$transaction([
    prisma.alertLog.deleteMany(),
    prisma.dqResult.deleteMany(),
    prisma.pipelineRun.deleteMany(),
    prisma.dqRule.deleteMany(),
    prisma.mdmMaster.deleteMany(),
    prisma.freshnessSla.deleteMany(),
    prisma.glossary.deleteMany(),
    prisma.dataCatalog.deleteMany(),
    prisma.rawSourceRecord.deleteMany(),
    prisma.factClaim.deleteMany(),
    prisma.factLabResult.deleteMany(),
    prisma.factEncounter.deleteMany(),
    prisma.dimTestCatalog.deleteMany(),
    prisma.dimDate.deleteMany(),
    prisma.dimPatient.deleteMany(),
    prisma.dimProvider.deleteMany(),
    prisma.dimLocation.deleteMany(),
    prisma.dimPayer.deleteMany(),
    prisma.claim.deleteMany(),
    prisma.labResult.deleteMany(),
    prisma.labOrder.deleteMany(),
    prisma.consent.deleteMany(),
    prisma.encounter.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.outboxEvent.deleteMany(),
    prisma.documentControl.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.provider.deleteMany(),
    prisma.location.deleteMany(),
    prisma.payer.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // --- 1. Users (one per role) ---------------------------------------------
  console.log('[seed] Users…');
  const passwordHash = await bcrypt.hash('Passw0rd!123', 10);
  const userSpecs: Array<{ email: string; fullName: string; role: UserRole }> = [
    { email: 'admin@medidata.local', fullName: 'Ada Ministrator', role: UserRole.ADMIN },
    { email: 'physician@medidata.local', fullName: 'Dr. Paul Physician', role: UserRole.PHYSICIAN },
    { email: 'labtech@medidata.local', fullName: 'Lara Labtech', role: UserRole.LAB_TECH },
    { email: 'biller@medidata.local', fullName: 'Bill Ingeles', role: UserRole.BILLER },
    { email: 'analyst@medidata.local', fullName: 'Ana Lyst', role: UserRole.ANALYST },
    { email: 'auditor@medidata.local', fullName: 'Aud Itora', role: UserRole.AUDITOR },
    { email: 'patient@medidata.local', fullName: 'Pat Ient', role: UserRole.PATIENT },
  ];
  const users = await prisma.$transaction(
    userSpecs.map((u) => prisma.user.create({ data: { ...u, passwordHash } })),
  );
  const userByRole = new Map(users.map((u) => [u.role, u]));

  // --- 2. Providers, locations, payers, patients ---------------------------
  console.log('[seed] Providers / locations / payers / patients…');
  const providers = await prisma.$transaction(
    PROVIDERS.map((p) => prisma.provider.create({ data: p })),
  );
  const locations = await prisma.$transaction(
    LOCATIONS.map((l) => prisma.location.create({ data: l })),
  );
  const payers = await prisma.$transaction(PAYERS.map((p) => prisma.payer.create({ data: p })));

  interface PatientSeed {
    mrn: string;
    firstName: string;
    lastName: string;
    fullNameNormalized: string;
    dateOfBirth: Date;
    sex: Sex;
    phone: string;
    email: string | null;
    address: string;
    city: string;
    sourceSystem: SourceSystem;
    externalId: string;
  }

  const patientSeeds: PatientSeed[] = [];
  for (let i = 0; i < 117; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    patientSeeds.push({
      mrn: `MRN-${String(100000 + i)}`,
      firstName,
      lastName,
      fullNameNormalized: `${firstName} ${lastName}`.toUpperCase().replace(/\./g, ''),
      dateOfBirth: dateBetween(new Date('1940-01-01T00:00:00Z'), new Date('2015-01-01T00:00:00Z')),
      sex: pick([Sex.MALE, Sex.FEMALE, Sex.FEMALE, Sex.MALE, Sex.OTHER]),
      phone: `+639${int(10, 99)}${int(1000000, 9999999)}`,
      email: rand() < 0.6 ? `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, '')}${int(1, 99)}@mail.test` : null,
      address: `${int(1, 999)} ${pick(['Rizal', 'Bonifacio', 'Mabini', 'Luna', 'Shaw'])} St`,
      city: pick(CITIES),
      sourceSystem: pick([SourceSystem.EMR, SourceSystem.EMR, SourceSystem.LEGACY]),
      externalId: `EXT-${int(10000, 99999)}`,
    });
  }

  // The deliberate cross-source duplicate trio — same person, messy variants.
  const DUPLICATE_DOB = new Date('1985-03-14T00:00:00Z');
  patientSeeds.push(
    {
      mrn: 'MRN-900001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      fullNameNormalized: 'JUAN DELA CRUZ',
      dateOfBirth: DUPLICATE_DOB,
      sex: Sex.MALE,
      phone: '+639171234567',
      email: 'juan.delacruz@mail.test',
      address: '12 Rizal St',
      city: 'Manila',
      sourceSystem: SourceSystem.EMR,
      externalId: 'EXT-JDC-1',
    },
    {
      mrn: 'MRN-900002',
      firstName: 'JUAN',
      lastName: 'DELA CRUZ',
      fullNameNormalized: 'JUAN DELA CRUZ',
      dateOfBirth: DUPLICATE_DOB,
      sex: Sex.MALE,
      phone: '+639171234567',
      email: 'JUAN.DELACRUZ@mail.test',
      address: '12 Rizal Street',
      city: 'MANILA',
      sourceSystem: SourceSystem.LIS,
      externalId: 'EXT-JDC-2',
    },
    {
      mrn: 'MRN-900003',
      firstName: 'Juan D.',
      lastName: 'Cruz',
      fullNameNormalized: 'JUAN CRUZ',
      dateOfBirth: DUPLICATE_DOB,
      sex: Sex.MALE,
      phone: '+639171234567',
      email: null,
      address: '12 Rizal St.',
      city: 'Manila',
      sourceSystem: SourceSystem.LEGACY,
      externalId: 'EXT-JDC-3',
    },
  );

  const patients = await prisma.$transaction(
    patientSeeds.map((p) => prisma.patient.create({ data: p })),
  );

  // --- 3. Encounters, lab orders/results, claims ---------------------------
  console.log('[seed] Encounters…');
  type EncounterSeed = Prisma.EncounterCreateManyInput & { patientId: string };
  const encounterSeeds: EncounterSeed[] = [];
  for (const patient of patients) {
    // Guarantee at least one encounter per patient.
    encounterSeeds.push(makeEncounter(patient.id));
  }
  for (let i = 0; i < 280; i++) {
    encounterSeeds.push(makeEncounter(pick(patients).id));
  }
  const encounters = await prisma.$transaction(
    encounterSeeds.map((e) => prisma.encounter.create({ data: e })),
  );

  function makeEncounter(patientId: string): EncounterSeed {
    const admittedAt = dateBetween(YEAR_START, YEAR_END);
    const type = pick([
      EncounterType.INPATIENT,
      EncounterType.OUTPATIENT,
      EncounterType.OUTPATIENT,
      EncounterType.EMERGENCY,
      EncounterType.TELEHEALTH,
    ]);
    const dx = pick(DIAGNOSES);
    const staysInpatient = type === EncounterType.INPATIENT;
    return {
      patientId,
      providerId: pick(providers).id,
      locationId: pick(locations).id,
      type,
      status: rand() < 0.85 ? 'DISCHARGED' : 'ACTIVE',
      admittedAt,
      dischargedAt: staysInpatient ? addDays(admittedAt, int(1, 9)) : addHours(admittedAt, int(1, 8)),
      diagnosisCode: dx.code,
      diagnosisText: dx.text,
    };
  }

  console.log('[seed] Lab orders + results…');
  const orderSeeds: Prisma.LabOrderCreateManyInput[] = [];
  const resultSeeds: Array<{ orderIdx: number } & Omit<Prisma.LabResultCreateManyInput, 'orderId'>> = [];
  for (let i = 0; i < 500; i++) {
    const patient = pick(patients);
    const test = pick(TEST_CATALOG);
    const orderedAt = dateBetween(YEAR_START, YEAR_END);
    const collectedAt = addHours(orderedAt, int(1, 24));
    // 5 deliberately INCONSISTENT rows: resultedAt BEFORE collectedAt.
    const inconsistent = i < 5;
    const resultedAt = inconsistent ? addHours(collectedAt, -3) : addHours(collectedAt, int(2, 48));
    const inRange = rand() < 0.75;
    const valueNumeric = inRange
      ? round1(test.refLow + rand() * (test.refHigh - test.refLow))
      : rand() < 0.5
        ? round1(test.refHigh + rand() * (test.refHigh - test.refLow) * 0.5)
        : round1(test.refLow - rand() * (test.refHigh - test.refLow) * 0.3);
    const abnormalFlag =
      valueNumeric > test.refHigh ? 'H' : valueNumeric < test.refLow ? 'L' : null;
    orderSeeds.push({
      patientId: patient.id,
      orderingProviderId: pick(providers).id,
      testCode: test.testCode,
      testName: test.testName,
      orderedAt,
      status: 'COMPLETED',
    });
    resultSeeds.push({
      orderIdx: i,
      patientId: patient.id,
      testCode: test.testCode,
      valueNumeric,
      valueText: null,
      unit: test.unit,
      referenceRange: test.refRange,
      abnormalFlag,
      collectedAt,
      resultedAt,
      reviewedAt: addHours(resultedAt, int(1, 12)),
      releasedAt: addHours(resultedAt, int(13, 24)),
      reviewedById: userByRole.get(UserRole.PHYSICIAN)?.id ?? null,
      status: rand() < 0.1 ? ResultStatus.CORRECTED : ResultStatus.RELEASED,
    });
  }
  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }
  const orders = await prisma.$transaction(
    orderSeeds.map((o) => prisma.labOrder.create({ data: o })),
  );
  await prisma.$transaction(
    resultSeeds.map((r) =>
      prisma.labResult.create({
        data: { ...r, orderId: orders[r.orderIdx]?.id as string },
      }),
    ),
  );

  console.log('[seed] Claims…');
  const claimSeeds: Prisma.ClaimCreateManyInput[] = [];
  for (let i = 0; i < 400; i++) {
    const encounter = pick(encounters);
    const billedAmount = int(500, 150000) / 10;
    const status = pick<ClaimStatus>([
      ClaimStatus.PAID, ClaimStatus.PAID, ClaimStatus.PAID, ClaimStatus.PAID,
      ClaimStatus.PAID, ClaimStatus.DENIED, ClaimStatus.PENDING, ClaimStatus.SUBMITTED,
    ]);
    const submittedAt = dateBetween(YEAR_START, YEAR_END);
    // ~15% have a DELAYED sourceUpdatedAt (> 72h after submission) — BILL-003 fodder.
    const sourceUpdatedAt =
      rand() < 0.15
        ? addDays(submittedAt, int(5, 10))
        : addHours(submittedAt, int(4, 60));
    const paid = status === ClaimStatus.PAID;
    claimSeeds.push({
      patientId: encounter.patientId,
      encounterId: encounter.id,
      payerId: pick(payers).id,
      claimNumber: `CLM-2024-${String(100000 + i)}`,
      status,
      billedAmount: round2(billedAmount),
      paidAmount: paid ? round2(billedAmount * (0.55 + rand() * 0.45)) : null,
      submittedAt,
      sourceUpdatedAt,
      paidAt: paid ? addDays(submittedAt, int(3, 30)) : null,
    });
  }
  function round2(n: number): Prisma.Decimal {
    return new Prisma.Decimal(n.toFixed(2));
  }
  await prisma.$transaction(claimSeeds.map((c) => prisma.claim.create({ data: c })));

  console.log('[seed] Consents…');
  await prisma.$transaction(
    patients.map((p) =>
      prisma.consent.create({
        data: {
          patientId: p.id,
          consentType: pick(CONSENT_TYPES),
          granted: rand() < 0.9,
          grantedAt: dateBetween(YEAR_START, YEAR_END),
          revokedAt: null,
        },
      }),
    ),
  );

  // --- 4. Warehouse seed data (dates + test catalog dimensions) ------------
  console.log('[seed] Warehouse dimensions…');
  const dimDateRows: Prisma.DimDateCreateManyInput[] = [];
  for (let d = new Date('2023-01-01T00:00:00Z'); d < new Date('2026-01-01T00:00:00Z'); d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    dimDateRows.push({
      dateKey: Number(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`),
      fullDate: new Date(d),
      year: d.getUTCFullYear(),
      quarter: Math.floor(d.getUTCMonth() / 3) + 1,
      month: d.getUTCMonth() + 1,
      week: Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7),
      dayOfWeek: dow,
      isWeekend: dow === 0 || dow === 6,
    });
  }
  await prisma.$transaction([
    prisma.dimDate.createMany({ data: dimDateRows }),
    prisma.dimTestCatalog.createMany({
      data: TEST_CATALOG.map((t) => ({
        testCode: t.testCode,
        testName: t.testName,
        loincCode: t.loincCode,
        unit: t.unit,
        department: 'Laboratory',
      })),
    }),
  ]);

  // --- 5. Governance --------------------------------------------------------
  console.log('[seed] Governance: catalog, glossary, DQ rules, SLAs…');
  const stewards = users.filter((u) => u.role !== UserRole.PATIENT);
  const catalogSpec: Array<[string, string, string, Classification, boolean, number | null]> = [
    ['app', 'patients', 'Master patient index (OLTP)', Classification.PHI, true, 2555],
    ['app', 'encounters', 'Clinical encounters and diagnoses', Classification.PHI, true, 2555],
    ['app', 'lab_results', 'Laboratory orders and results', Classification.PHI, true, 3650],
    ['app', 'claims', 'Insurance claims and payments', Classification.PHI, true, 3650],
    ['app', 'audit_log', 'Immutable access/audit trail', Classification.INTERNAL, false, 3650],
    ['staging', 'raw_source_record', 'Raw landed source payloads (pre-cleanse)', Classification.PHI, true, 90],
    ['warehouse', 'dim_patient', 'Patient dimension (golden records)', Classification.PII, false, null],
    ['warehouse', 'fact_claim', 'Claim facts for billing analytics', Classification.PHI, true, 3650],
    ['gov', 'dq_rule', 'Data-quality rule definitions', Classification.INTERNAL, false, null],
    ['gov', 'data_catalog', 'This catalog itself', Classification.PUBLIC, false, null],
  ];
  await prisma.$transaction(
    catalogSpec.map(([schemaName, tableName, description, classification, containsPhi, retentionDays], i) =>
      prisma.dataCatalog.create({
        data: {
          schemaName,
          tableName,
          description,
          stewardUserId: stewards[i % stewards.length]?.id ?? null,
          classification,
          containsPhi,
          retentionDays,
        },
      }),
    ),
  );

  const glossarySpec: Array<[string, string, string]> = [
    ['Golden Record', 'The single surviving best-version-of-truth record for an entity after MDM survivorship rules run.', 'MDM'],
    ['MRN', 'Medical Record Number — the local identifier assigned by a care facility.', 'Clinical'],
    ['Duplicate Rate', 'Percentage of patient records that are probabilistic duplicates of another record.', 'Quality'],
    ['Turnaround Time (TAT)', 'Elapsed time from specimen collection (collected_at) to result availability (resulted_at), in hours.', 'Laboratory'],
    ['Data Quality Score', 'Overall 0-100 score derived from passing/failing DQ rules weighted by severity.', 'Quality'],
    ['Survivorship Rule', 'The deterministic policy choosing which source wins for each field when merging records.', 'MDM'],
    ['PHI', 'Protected Health Information — any data that could identify a individual and relates to health.', 'Governance'],
    ['Lineage', 'The recorded path of data from source system through staging into warehouse tables.', 'Governance'],
    ['Freshness SLA', 'The maximum tolerated staleness (minutes) for a table before an alert is raised.', 'Operations'],
    ['Billing Lag', 'Mean hours between claim submission (submitted_at) and payer-side update (source_updated_at).', 'Billing'],
  ];
  await prisma.$transaction(
    glossarySpec.map(([term, definition, domain]) =>
      prisma.glossary.create({
        data: {
          term,
          definition,
          domain,
          ownerUserId: stewards[Math.floor(rand() * stewards.length)]?.id ?? null,
        },
      }),
    ),
  );

  // DQ rules — sqlAssertion returns the FAILING-ROW COUNT.
  const dqRules: Array<Omit<Prisma.DqRuleCreateManyInput, 'id'>> = [
    {
      code: 'PAT-001', name: 'UNIQUE_MRN', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'patients',
      sqlAssertion: 'SELECT COUNT(*) FROM (SELECT mrn FROM app.patients GROUP BY mrn HAVING COUNT(*) > 1) d',
      description: 'MRN must be unique across the patient index.',
    },
    {
      code: 'PAT-002', name: 'DOB_NOT_NULL', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'patients',
      sqlAssertion: 'SELECT COUNT(*) FROM app.patients WHERE "dateOfBirth" IS NULL',
      description: 'Every patient must have a date of birth.',
    },
    {
      code: 'PAT-003', name: 'VALID_SEX_CODE', severity: Severity.WARNING,
      targetSchema: 'app', targetTable: 'patients',
      sqlAssertion: "SELECT COUNT(*) FROM app.patients WHERE sex NOT IN ('MALE','FEMALE','OTHER','UNKNOWN')",
      description: 'Sex must use the controlled code set.',
    },
    {
      code: 'PAT-004', name: 'DUPLICATE_PATIENT_DETECTION', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'patients',
      sqlAssertion: 'SELECT COUNT(*) FROM app.patients p1 JOIN app.patients p2 ON p1."fullNameNormalized" = p2."fullNameNormalized" AND p1."dateOfBirth" = p2."dateOfBirth" AND p1.id > p2.id',
      description: 'Same normalized name + DOB indicates a probable duplicate patient.',
    },
    {
      code: 'LAB-001', name: 'RESULT_TIMESTAMP_ORDER', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'lab_results',
      sqlAssertion: 'SELECT COUNT(*) FROM app.lab_results WHERE "resultedAt" IS NOT NULL AND "collectedAt" > "resultedAt"',
      description: 'collected_at must be <= resulted_at.',
    },
    {
      code: 'LAB-002', name: 'VALUE_IN_RANGE', severity: Severity.WARNING,
      targetSchema: 'app', targetTable: 'lab_results',
      sqlAssertion: "SELECT COUNT(*) FROM app.lab_results WHERE \"abnormalFlag\" IS NOT NULL AND \"abnormalFlag\" NOT IN ('H','L','A')",
      description: 'Abnormal flag must be from the controlled set when present.',
    },
    {
      code: 'LAB-003', name: 'RESULT_NOT_NULL_VALUE', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'lab_results',
      sqlAssertion: 'SELECT COUNT(*) FROM app.lab_results WHERE "valueNumeric" IS NULL AND "valueText" IS NULL',
      description: 'A resulted result must carry either a numeric or textual value.',
    },
    {
      code: 'BILL-001', name: 'AMOUNT_NON_NEGATIVE', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'claims',
      sqlAssertion: 'SELECT COUNT(*) FROM app.claims WHERE "billedAmount" < 0 OR "paidAmount" < 0',
      description: 'Billed and paid amounts must never be negative.',
    },
    {
      code: 'BILL-002', name: 'PAID_LE_BILLED', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'claims',
      sqlAssertion: 'SELECT COUNT(*) FROM app.claims WHERE "paidAmount" IS NOT NULL AND "paidAmount" > "billedAmount"',
      description: 'Paid amount must not exceed billed amount.',
    },
    {
      code: 'BILL-003', name: 'BILLING_UPDATE_SLA', severity: Severity.WARNING,
      targetSchema: 'app', targetTable: 'claims',
      sqlAssertion: "SELECT COUNT(*) FROM app.claims WHERE status IN ('SUBMITTED','PENDING') AND \"sourceUpdatedAt\" < now() - INTERVAL '72 hours'",
      description: 'Open claims must receive a payer-side update within 72 hours.',
    },
    {
      code: 'REF-001', name: 'ORPHAN_FK', severity: Severity.CRITICAL,
      targetSchema: 'app', targetTable: 'claims',
      sqlAssertion: 'SELECT COUNT(*) FROM app.claims c LEFT JOIN app.encounters e ON c."encounterId" = e.id WHERE e.id IS NULL',
      description: 'Every claim must reference an existing encounter.',
    },
    {
      code: 'REF-002', name: 'CODE_SET_VALID', severity: Severity.WARNING,
      targetSchema: 'app', targetTable: 'encounters',
      sqlAssertion: "SELECT COUNT(*) FROM app.encounters WHERE type NOT IN ('INPATIENT','OUTPATIENT','EMERGENCY','TELEHEALTH')",
      description: 'Encounter type must come from the controlled code set.',
    },
  ];
  await prisma.$transaction(dqRules.map((r) => prisma.dqRule.create({ data: r })));

  const slaUser = userByRole.get(UserRole.ANALYST) ?? stewards[0];
  await prisma.$transaction([
    prisma.freshnessSla.create({
      data: { tableName: 'app.patients', maxStalenessMinutes: 60, ownerUserId: slaUser?.id ?? null },
    }),
    prisma.freshnessSla.create({
      data: { tableName: 'warehouse.fact_claim', maxStalenessMinutes: 1440, ownerUserId: slaUser?.id ?? null },
    }),
    prisma.freshnessSla.create({
      data: { tableName: 'staging.raw_source_record', maxStalenessMinutes: 30, ownerUserId: slaUser?.id ?? null },
    }),
  ]);

  // --- DocumentControl (ISO 15189-style) -----------------------------------
  console.log('[seed] DocumentControl…');
  await prisma.$transaction([
    prisma.documentControl.create({
      data: {
        docCode: 'QMS-001', title: 'Quality Management System Manual (ISO 15189 §4)',
        version: '1.2', status: 'EFFECTIVE', effectiveAt: new Date('2024-01-01T00:00:00Z'),
        reviewedAt: new Date('2024-11-01T00:00:00Z'),
        ownerUserId: userByRole.get(UserRole.ADMIN)?.id ?? null,
      },
    }),
    prisma.documentControl.create({
      data: {
        docCode: 'SOP-LAB-002', title: 'Laboratory Result Review and Release SOP',
        version: '2.1', status: 'EFFECTIVE', effectiveAt: new Date('2024-03-15T00:00:00Z'),
        reviewedAt: new Date('2024-10-15T00:00:00Z'),
        ownerUserId: userByRole.get(UserRole.PHYSICIAN)?.id ?? null,
      },
    }),
    prisma.documentControl.create({
      data: {
        docCode: 'GOV-003', title: 'Data Governance, Stewardship and Retention Policy',
        version: '1.0', status: 'EFFECTIVE', effectiveAt: new Date('2024-06-01T00:00:00Z'),
        reviewedAt: null,
        ownerUserId: userByRole.get(UserRole.AUDITOR)?.id ?? null,
      },
    }),
  ]);

  // --- 6. Fixture files simulating the siloed source systems ---------------
  console.log('[seed] Writing fixtures/ source-system files…');
  await writeFixtures(patients, orders, payers);

  console.log(
    `[seed] Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ` +
      `users:${users.length} providers:${providers.length} locations:${locations.length} ` +
      `payers:${payers.length} patients:${patients.length} encounters:${encounters.length} ` +
      `orders:${orders.length} claims:400`,
  );
}

// ---------------------------------------------------------------------------
// Fixtures — the "external siloed systems" ETL will extract from later.
// ---------------------------------------------------------------------------

async function writeFixtures(
  patients: Array<{ id: string; mrn: string; firstName: string; lastName: string; dateOfBirth: Date; sex: Sex; phone: string | null; city: string | null; externalId: string | null }>,
  orders: Array<{ id: string; patientId: string; testCode: string; testName: string; orderedAt: Date }>,
  payers: Array<{ id: string; code: string; name: string }>,
): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..', '..');
  const fixtures = path.join(repoRoot, 'fixtures');
  for (const dir of ['emr', 'lis', 'billing', 'insurance', 'legacy', 'hl7']) {
    await mkdir(path.join(fixtures, dir), { recursive: true });
  }
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

  // fixtures/emr/patients.json — clean EMR export (includes the duplicate trio).
  const emrPatients = [
    ...patients.slice(0, 10),
    ...patients.filter((p) => p.mrn.startsWith('MRN-900')),
  ].map((p) => ({
    emr_patient_id: p.externalId,
    mrn: p.mrn,
    first_name: p.firstName,
    last_name: p.lastName,
    dob: iso(p.dateOfBirth),
    sex: p.sex,
    phone: p.phone,
    city: p.city,
  }));
  await writeFile(path.join(fixtures, 'emr', 'patients.json'), JSON.stringify(emrPatients, null, 2), 'utf8');

  // fixtures/lis/results.json — HL7-derived lab results.
  const lisResults = orders.slice(0, 12).map((o, i) => ({
    lis_order_id: `LIS-${300000 + i}`,
    emr_mrn: patients.find((p) => p.id === o.patientId)?.mrn ?? 'UNKNOWN',
    test_code: o.testCode,
    test_name: o.testName,
    ordered_at: o.orderedAt.toISOString(),
    value: round1Local(10 + rand() * 40),
    unit: 'mg/dL',
    reference_range: '10-50',
    result_status: 'F',
  }));
  await writeFile(path.join(fixtures, 'lis', 'results.json'), JSON.stringify(lisResults, null, 2), 'utf8');
  function round1Local(n: number): number {
    return Math.round(n * 10) / 10;
  }

  // fixtures/billing/claims.csv — payer feed.
  const claimCsvRows = [
    'claim_number,mrn,payer_code,billed_amount,paid_amount,status,submitted_at',
  ];
  for (let i = 0; i < 12; i++) {
    const p = patients[i];
    const payer = payers[i % payers.length];
    const billed = (int(500, 90000) / 10).toFixed(2);
    claimCsvRows.push(
      `CLM-2024-${900000 + i},${p?.mrn},${payer?.code},${billed},${(Number(billed) * 0.8).toFixed(2)},PAID,2024-0${(i % 9) + 1}-1${i % 9}`,
    );
  }
  await writeFile(path.join(fixtures, 'billing', 'claims.csv'), claimCsvRows.join('\n'), 'utf8');

  // fixtures/insurance/policies.json — eligibility/policy feed.
  const policies = patients.slice(0, 8).map((p, i) => ({
    policy_number: `POL-${700000 + i}`,
    mrn: p.mrn,
    payer_code: payers[i % (payers.length - 1)]?.code ?? 'MAXICARE',
    member_number: `MBR${int(1000000, 9999999)}`,
    effective_date: '2024-01-01',
    terminated_date: null,
    status: 'ACTIVE',
  }));
  await writeFile(path.join(fixtures, 'insurance', 'policies.json'), JSON.stringify(policies, null, 2), 'utf8');

  // fixtures/legacy/patient_registry.csv — deliberately MESSY: mixed date
  // formats (01/05/2024 vs 2024-01-05), name casing, duplicate rows, invalid
  // sex codes, blank DOBs.
  const legacyRows = ['patient_id,full_name,dob,sex,city'];
  legacyRows.push('L-001,JUAN DELA CRUZ,03/14/1985,M,Manila'); // MM/DD/YYYY
  legacyRows.push('L-002,juan dela cruz,1985-03-14,M,MANILA'); // dup, ISO date
  legacyRows.push('L-003,Juan D. Cruz,14/03/1985,m,Manila'); // DD/MM/YYYY, lowercase sex
  legacyRows.push('L-004,maria santos,1978-11-02,F,Quezon City');
  legacyRows.push('L-005,MARIA  SANTOS,11/02/1978,F,Quezon City'); // dup, double space
  legacyRows.push('L-006,jose reyes,,X,Cebu City'); // blank DOB, invalid sex
  legacyRows.push('L-007,Ana Bautista,1990-07-23,,Davao City'); // blank sex
  legacyRows.push('L-008,ana bautista,7/23/1990,female,Davao City'); // dup, long sex code
  legacyRows.push('L-009,MIGUEL MENDOZA,1966-02-01,M,Makati');
  legacyRows.push('L-010,miguel mendoza,02/01/1966,M,Makati'); // dup
  legacyRows.push('L-011,Angelica Garcia,2001-09-09,F,Pasig');
  legacyRows.push('L-012,rafael villanueva,,M?,Iloilo City'); // blank DOB, invalid sex
  await writeFile(path.join(fixtures, 'legacy', 'patients_legacy.csv'), legacyRows.join('\n'), 'utf8');

  // fixtures/hl7/adt_a01.hl7 — valid HL7 v2.5.1 ADT^A01 (CR-separated segments).
  const adt = [
    'MSH|^~\\&|MEDIDATA_EMR|MEDIDATA_HOSP|MEDIDATA_LIS|LAB|202405151030||ADT^A01^ADT_A01|MSG00001|P|2.5.1',
    'EVN|A01|202405151030',
    `PID|1||${patients[0]?.mrn ?? 'MRN-100000'}^^^MEDIDATA_HOSP^MR||${patients[0]?.lastName ?? 'DELA CRUZ'}^${patients[0]?.firstName ?? 'JUAN'}||19850314|M|||12 Rizal St^^Manila^NCR^0100^PH||(632)555-0100`,
    'PV1|1|O|QC^OPD-2^01||||1234567890^Ramos^Elena^^^Dr.|||Outpatient|||||||1234567890^Ramos^Elena^^^Dr.|OUTP|VISIT-0001||||||||||||||||||||||||||202405151030',
  ].join('\r');
  await writeFile(path.join(fixtures, 'hl7', 'adt_a01.hl7'), adt + '\r', 'utf8');

  // fixtures/hl7/oru_r01.hl7 — valid HL7 v2.5.1 ORU^R01 lab result message.
  const oru = [
    'MSH|^~\\&|MEDIDATA_LIS|MEDIDATA_HOSP|MEDIDATA_EMR|EMR|202405151430||ORU^R01^ORU_R01|MSG00002|P|2.5.1',
    `PID|1||${patients[1]?.mrn ?? 'MRN-100001'}^^^MEDIDATA_HOSP^MR||${patients[1]?.lastName ?? 'SANTOS'}^${patients[1]?.firstName ?? 'MARIA'}||19781102|F`,
    'OBR|1|ORD-400001|LAB-400001|GLU^Glucose, Fasting^2345-7|||202405151200',
    'OBX|1|NM|GLU^Glucose^2345-7||96|mg/dL|70-110|N|||F',
  ].join('\r');
  await writeFile(path.join(fixtures, 'hl7', 'oru_r01.hl7'), oru + '\r', 'utf8');

  console.log('[seed] Fixtures written to fixtures/ (emr, lis, billing, insurance, legacy, hl7).');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('[seed] FAILED:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
