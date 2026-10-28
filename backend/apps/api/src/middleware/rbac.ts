/**
 * RBAC — @casl/ability rule table covering ALL seven seeded roles.
 * `requirePermission` enforces (action, subject) on every route; services add
 * data-level scoping (e.g. PATIENT → own records only, ANALYST/BILLER → PHI
 * masked via middleware/masking.ts).
 *
 * Subject vocabulary (strings so CASL stays schema-free):
 *   all, Patient, Encounter, LabOrder, LabResult, Claim, Invoice,
 *   InsurancePolicy, Consent, Provider, Payer, AuditLog, User, AdminUser,
 *   Kpi, MlRisk, Stream, FhirResource, Portal, Hl7Inbound, WebhookOutbound,
 *   Governance (CatalogEntry/GlossaryTerm/Lineage/PipelineRun/DqRule/DqResult/
 *   FreshnessStatus/MdmMergeCandidate), DocumentControl, OutboxEvent
 */
import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { type Role } from '@medidata/shared';
import { ApiError } from '../lib/envelope.js';

export type AppAction = 'manage' | 'read' | 'create' | 'update' | 'delete' | 'review' | 'release';
export type AppSubject = string;
export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

/** Central, auditable role→rules table. Extend here — nowhere else. */
export function defineAbilityFor(role: Role): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (role) {
    case 'ADMIN':
      // Full platform access, including governance/audit and administration.
      can('manage', 'all');
      break;

    case 'PHYSICIAN':
      // Read all clinical + billing context, write lab review/release + orders.
      can(['read'], ['Patient', 'Encounter', 'LabOrder', 'LabResult', 'Claim', 'InsurancePolicy', 'Consent', 'Provider', 'Payer']);
      can('create', 'LabOrder');
      can(['update', 'review'], 'LabResult');
      can('release', 'LabResult'); // authorized release (ISO 15189)
      can(['read'], ['Kpi', 'MlRisk', 'Stream', 'FhirResource', 'Hl7Inbound', 'Portal']);
      break;

    case 'LAB_TECH':
      // Result entry + review; may NOT release results to patients.
      can(['read'], ['Patient', 'Encounter', 'LabOrder', 'LabResult', 'Provider']);
      can('create', 'LabOrder');
      can(['update', 'review'], 'LabResult');
      can(['read'], ['Kpi', 'Stream', 'FhirResource', 'Hl7Inbound', 'WebhookOutbound']);
      break;

    case 'BILLER':
      // Owns billing + insurance; clinical access is read-only AND masked.
      can(['read', 'create', 'update'], ['Claim', 'Invoice', 'InsurancePolicy']);
      can(['read'], ['Patient', 'Encounter', 'Payer', 'Kpi', 'WebhookOutbound']); // masked clinical read
      break;

    case 'ANALYST':
      // Marts/warehouse + governance, PHI masked; no audit log, no writes.
      can(['read'], ['Kpi', 'MlRisk', 'Stream']);
      can(['read'], ['Governance', 'CatalogEntry', 'GlossaryTerm', 'Lineage', 'PipelineRun', 'DqRule', 'DqResult', 'FreshnessStatus', 'MdmMergeCandidate']);
      can(['read'], ['Patient', 'Encounter', 'Claim', 'LabResult', 'Payer']); // masked
      break;

    case 'AUDITOR':
      // Read-only across the platform, explicitly including the audit trail.
      can('read', 'all');
      break;

    case 'PATIENT':
      // Own records only — services scope by resolvePatientForUser().
      can(['read'], ['Portal', 'Patient', 'Encounter', 'LabResult', 'Claim', 'Consent']);
      break;
  }

  return build();
}

/** Express guard: 403 unless the actor's role can perform action on subject. */
export function requirePermission(
  action: AppAction,
  subject: AppSubject | AppSubject[],
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
    const ability = defineAbilityFor(req.auth.role);
    const subjects = Array.isArray(subject) ? subject : [subject];
    const allowed = subjects.every((s) => ability.can(action, s));
    if (!allowed) {
      return next(
        new ApiError(403, 'FORBIDDEN', `Role ${req.auth.role} is not permitted to ${action} ${subjects.join('/')}`),
      );
    }
    next();
  };
}

/** Serializable `action:subject` pairs for GET /api/auth/me (UI capability map). */
export function abilityMapFor(role: Role): string[] {
  const ability = defineAbilityFor(role);
  const pairs = new Set<string>();
  for (const rule of ability.rules) {
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    for (const a of actions) for (const s of subjects) pairs.add(`${a}:${s}`);
  }
  return [...pairs].sort();
}
