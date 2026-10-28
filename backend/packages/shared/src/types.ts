/**
 * Inferred TypeScript types for every canonical schema. Import types from
 * `@medidata/shared` — never redefine them in consuming workspaces.
 */
import type { z } from 'zod';
import type {
  ApiEnvelopeSchema,
  AuditLogEntrySchema,
  CatalogEntrySchema,
  ClaimSchema,
  ConsentSchema,
  DqResultSchema,
  DqRuleSchema,
  EncounterSchema,
  FreshnessStatusSchema,
  GlossaryTermSchema,
  InsurancePolicySchema,
  LabOrderSchema,
  LabResultSchema,
  LineageNodeSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MdmMergeCandidateSchema,
  OutcomeKpisSchema,
  Patient360Schema,
  PatientSchema,
  PatientSummarySchema,
  PipelineRunSchema,
  PayerSchema,
  QualityScorecardSchema,
  ResultStatusSchema,
  RiskScoreSchema,
  RoleSchema,
  SexSchema,
  UserSchema,
} from './schemas.js';
import type { EndpointKey } from './constants.js';

export type Role = z.infer<typeof RoleSchema>;
export type Sex = z.infer<typeof SexSchema>;
export type ResultStatus = z.infer<typeof ResultStatusSchema>;

export type User = z.infer<typeof UserSchema>;
export type Patient = z.infer<typeof PatientSchema>;
export type PatientSummary = z.infer<typeof PatientSummarySchema>;
export type Patient360 = z.infer<typeof Patient360Schema>;
export type Encounter = z.infer<typeof EncounterSchema>;
export type LabOrder = z.infer<typeof LabOrderSchema>;
export type LabResult = z.infer<typeof LabResultSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Payer = z.infer<typeof PayerSchema>;
export type InsurancePolicy = z.infer<typeof InsurancePolicySchema>;
export type Consent = z.infer<typeof ConsentSchema>;

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type LineageNode = z.infer<typeof LineageNodeSchema>;
export type PipelineRun = z.infer<typeof PipelineRunSchema>;
export type DqRule = z.infer<typeof DqRuleSchema>;
export type DqResult = z.infer<typeof DqResultSchema>;
export type QualityScorecard = z.infer<typeof QualityScorecardSchema>;
export type MdmMergeCandidate = z.infer<typeof MdmMergeCandidateSchema>;
export type FreshnessStatus = z.infer<typeof FreshnessStatusSchema>;

export type OutcomeKpis = z.infer<typeof OutcomeKpisSchema>;
export type RiskScore = z.infer<typeof RiskScoreSchema>;

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** Standard response wrapper used by every API route. */
export type ApiEnvelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

export type { EndpointKey };
