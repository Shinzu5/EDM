/**
 * Canonical zod schemas — the API contract shared by apps/api, apps/web and
 * apps/worker. Inferred types live next to them (see types.ts). Dates are
 * z.coerce.date() so both `Date` objects (server) and ISO strings (JSON) pass.
 */
import { z } from 'zod';
import { ROLES } from './constants.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const RoleSchema = z.enum(ROLES);
export const SexSchema = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']);
export const EncounterTypeSchema = z.enum(['INPATIENT', 'OUTPATIENT', 'EMERGENCY', 'TELEHEALTH']);
export const ClaimStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'PENDING',
  'PAID',
  'DENIED',
  'APPEALED',
]);
export const ResultStatusSchema = z.enum([
  'COLLECTED',
  'IN_PROGRESS',
  'REVIEWED',
  'RELEASED',
  'CORRECTED',
]);
export const SourceSystemSchema = z.enum(['EMR', 'LIS', 'BILLING', 'INSURANCE', 'LEGACY']);
export const JobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED']);
export const SeveritySchema = z.enum(['WARNING', 'CRITICAL']);
export const ClassificationSchema = z.enum(['PUBLIC', 'INTERNAL', 'PII', 'PHI']);

export const DateTimeSchema = z.coerce.date();
export const DateOnlySchema = z.coerce.date();
export const AmountSchema = z.number().nonnegative();
export const UuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
  id: UuidSchema,
  email: z.string().email(),
  fullName: z.string(),
  role: RoleSchema,
  isActive: z.boolean(),
  createdAt: DateTimeSchema,
});
export const UserWithPasswordSchema = UserSchema.extend({
  passwordHash: z.string(),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const LoginResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
});
export const AuthMeSchema = z.object({
  user: UserSchema,
});

// ---------------------------------------------------------------------------
// Patients / clinical
// ---------------------------------------------------------------------------

export const PatientSchema = z.object({
  id: UuidSchema,
  mrn: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullNameNormalized: z.string(),
  dateOfBirth: DateOnlySchema,
  sex: SexSchema,
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  sourceSystem: SourceSystemSchema,
  createdAt: DateTimeSchema,
});

/** Compact row used in patient lists/search. */
export const PatientSummarySchema = PatientSchema.extend({
  encounterCount: z.number().int().nonnegative(),
  lastEncounterAt: DateTimeSchema.nullable().optional(),
  openClaimCount: z.number().int().nonnegative(),
  goldenId: z.string().nullable().optional(),
  duplicateCount: z.number().int().nonnegative().optional(),
});

export const EncounterSchema = z.object({
  id: UuidSchema,
  patientId: UuidSchema,
  providerId: UuidSchema,
  locationId: UuidSchema,
  type: EncounterTypeSchema,
  status: z.string(),
  admittedAt: DateTimeSchema,
  dischargedAt: DateTimeSchema.nullable().optional(),
  diagnosisCode: z.string(),
  diagnosisText: z.string(),
});

export const LabOrderSchema = z.object({
  id: UuidSchema,
  patientId: UuidSchema,
  orderingProviderId: UuidSchema,
  testCode: z.string(),
  testName: z.string(),
  orderedAt: DateTimeSchema,
  status: z.string(),
});

export const LabResultSchema = z.object({
  id: UuidSchema,
  orderId: UuidSchema,
  patientId: UuidSchema,
  testCode: z.string(),
  valueNumeric: z.number().nullable().optional(),
  valueText: z.string().nullable().optional(),
  unit: z.string(),
  referenceRange: z.string(),
  abnormalFlag: z.string().nullable().optional(),
  collectedAt: DateTimeSchema,
  resultedAt: DateTimeSchema.nullable().optional(),
  reviewedAt: DateTimeSchema.nullable().optional(),
  releasedAt: DateTimeSchema.nullable().optional(),
  status: ResultStatusSchema,
});

export const PayerSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  type: z.string(),
});

export const ClaimSchema = z.object({
  id: UuidSchema,
  patientId: UuidSchema,
  encounterId: UuidSchema,
  payerId: UuidSchema,
  claimNumber: z.string(),
  status: ClaimStatusSchema,
  billedAmount: AmountSchema,
  paidAmount: AmountSchema.nullable().optional(),
  submittedAt: DateTimeSchema,
  sourceUpdatedAt: DateTimeSchema,
  paidAt: DateTimeSchema.nullable().optional(),
});

export const InsurancePolicySchema = z.object({
  id: UuidSchema,
  patientId: UuidSchema,
  payerId: UuidSchema,
  payerCode: z.string(),
  payerName: z.string(),
  memberNumber: z.string(),
  effectiveAt: DateOnlySchema,
  terminatedAt: DateOnlySchema.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']),
});

export const ConsentSchema = z.object({
  id: UuidSchema,
  patientId: UuidSchema,
  consentType: z.string(),
  granted: z.boolean(),
  grantedAt: DateTimeSchema,
  revokedAt: DateTimeSchema.nullable().optional(),
});

/** Full 360° view of a patient returned by GET /api/patients/:id */
export const Patient360Schema = z.object({
  patient: PatientSchema,
  encounters: z.array(EncounterSchema),
  labResults: z.array(LabResultSchema),
  claims: z.array(ClaimSchema),
  insurance: z.array(InsurancePolicySchema),
  consents: z.array(ConsentSchema),
});
export const Patient360ListSchema = z.array(Patient360Schema);

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export const AuditLogEntrySchema = z.object({
  id: UuidSchema,
  actorUserId: UuidSchema.nullable().optional(),
  actorRole: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  beforeJson: z.unknown().nullable().optional(),
  afterJson: z.unknown().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: DateTimeSchema,
});

export const CatalogEntrySchema = z.object({
  id: UuidSchema,
  schemaName: z.string(),
  tableName: z.string(),
  description: z.string(),
  stewardUserId: UuidSchema.nullable().optional(),
  classification: ClassificationSchema,
  containsPhi: z.boolean(),
  retentionDays: z.number().int().nullable().optional(),
});

export const GlossaryTermSchema = z.object({
  id: UuidSchema,
  term: z.string(),
  definition: z.string(),
  domain: z.string(),
  ownerUserId: UuidSchema.nullable().optional(),
});

export const LineageNodeSchema = z.object({
  node: z.string(),
  schemaName: z.string(),
  table: z.string(),
  upstream: z.array(z.string()),
  pipeline: z.string().nullable().optional(),
});

export const PipelineRunSchema = z.object({
  id: UuidSchema,
  pipelineName: z.string(),
  status: JobStatusSchema,
  rowsIn: z.number().int().nullable().optional(),
  rowsOut: z.number().int().nullable().optional(),
  startedAt: DateTimeSchema,
  finishedAt: DateTimeSchema.nullable().optional(),
  errorMsg: z.string().nullable().optional(),
});

export const DqRuleSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  severity: SeveritySchema,
  targetSchema: z.string(),
  targetTable: z.string(),
  sqlAssertion: z.string(),
  description: z.string(),
  isActive: z.boolean(),
});

export const DqResultSchema = z.object({
  id: UuidSchema,
  ruleId: UuidSchema,
  runId: UuidSchema.nullable().optional(),
  passed: z.boolean(),
  failedCount: z.number().int().nonnegative(),
  sampleKeys: z.unknown().nullable().optional(),
  checkedAt: DateTimeSchema,
});

/** Per-rule results plus an overall 0-100 quality score. */
export const QualityScorecardSchema = z.object({
  overallScore: z.number().min(0).max(100),
  totalRules: z.number().int().nonnegative(),
  passedRules: z.number().int().nonnegative(),
  failedRules: z.number().int().nonnegative(),
  criticalFailures: z.number().int().nonnegative(),
  results: z.array(
    DqResultSchema.extend({
      rule: DqRuleSchema,
    }),
  ),
  generatedAt: DateTimeSchema,
});

export const MdmMergeCandidateSchema = z.object({
  goldenId: z.string(),
  leftPatientId: UuidSchema,
  rightPatientId: UuidSchema,
  matchScore: z.number().min(0).max(1),
  matchReasons: z.array(z.string()),
  survivorshipRule: z.string(),
});

export const FreshnessStatusSchema = z.object({
  tableName: z.string(),
  maxStalenessMinutes: z.number().int().positive(),
  lastLoadedAt: DateTimeSchema.nullable(),
  stalenessMinutes: z.number().nullable(),
  isStale: z.boolean(),
  ownerUserId: UuidSchema.nullable().optional(),
});

// ---------------------------------------------------------------------------
// Analytics / ML
// ---------------------------------------------------------------------------

export const OutcomeKpisSchema = z.object({
  duplicateRateBefore: z.number(),
  duplicateRateAfter: z.number(),
  avgTatBefore: z.number(),
  avgTatAfter: z.number(),
  billingLagBefore: z.number(),
  billingLagAfter: z.number(),
  dqScore: z.number().min(0).max(100),
});

export const RiskScoreSchema = z.object({
  patientId: UuidSchema,
  goldenId: z.string().nullable().optional(),
  riskScore: z.number().min(0).max(1),
  riskBand: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  topFactors: z.array(z.object({ factor: z.string(), contribution: z.number() })),
  modelVersion: z.string(),
  generatedAt: DateTimeSchema,
});

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const ApiEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.boolean(),
    data: data.optional(),
    error: ErrorSchema.optional(),
  });
