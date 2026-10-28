/**
 * CASL-style authorization rules (pure — unit tested).
 *
 * Subject/action vocabulary used by nav filtering, AuthGuard and controls:
 * every role sees only what it needs; PHI writes are limited to clinical
 * roles; analytics/governance are read-only for non-admins.
 */
import type { Role } from '@medidata/shared';

export type Action = 'read' | 'write' | 'review' | 'release' | 'manage' | 'audit';

export type Subject =
  | 'dashboard'
  | 'patients'
  | 'encounters'
  | 'labs'
  | 'billing'
  | 'insurance'
  | 'analytics'
  | 'kpi'
  | 'governance'
  | 'mdm'
  | 'audit'
  | 'admin'
  | 'portal';

type Rule = { action: Action | '*'; subjects: Subject[] | '*' };

const READ_ALL_CLINICAL: Subject[] = [
  'dashboard',
  'patients',
  'encounters',
  'labs',
  'kpi',
];

const RULES: Record<Role, Rule[]> = {
  ADMIN: [{ action: '*', subjects: '*' }],

  // Physicians: full clinical read/write + result release; no admin/audit.
  PHYSICIAN: [
    { action: 'read', subjects: [...READ_ALL_CLINICAL, 'billing', 'insurance', 'analytics', 'governance', 'mdm'] },
    { action: 'write', subjects: ['patients', 'encounters'] },
    { action: 'review', subjects: ['labs'] },
    { action: 'release', subjects: ['labs'] },
  ],

  // Lab techs: order/result authoring + review. Release stays with the
  // physician (documented ISO 15189 authorization step in the UI).
  LAB_TECH: [
    { action: 'read', subjects: [...READ_ALL_CLINICAL, 'governance'] },
    { action: 'write', subjects: ['labs'] },
    { action: 'review', subjects: ['labs'] },
  ],

  // Billers: revenue cycle only — no clinical writes.
  BILLER: [
    { action: 'read', subjects: ['dashboard', 'patients', 'billing', 'insurance', 'kpi'] },
    { action: 'write', subjects: ['billing'] },
  ],

  // Analysts: analytics + governance insight; strictly read-only on PHI.
  ANALYST: [
    {
      action: 'read',
      subjects: ['dashboard', 'patients', 'labs', 'billing', 'analytics', 'kpi', 'governance', 'mdm'],
    },
  ],

  // Auditors: broad read + the audit trail; never writes.
  AUDITOR: [
    {
      action: 'read',
      subjects: [
        'dashboard',
        'patients',
        'encounters',
        'labs',
        'billing',
        'insurance',
        'analytics',
        'kpi',
        'governance',
        'mdm',
        'audit',
      ],
    },
    { action: 'audit', subjects: ['audit'] },
  ],

  // Patients: portal only (own records/consent). Everything else is denied.
  PATIENT: [
    { action: 'read', subjects: ['portal'] },
    { action: 'write', subjects: ['portal'] },
  ],
};

/** Pure role→permission check. `role === undefined` denies everything. */
export function roleCan(
  role: Role | undefined | null,
  action: Action,
  subject: Subject,
): boolean {
  if (!role) return false;
  const rules = RULES[role];
  if (!rules) return false; // unknown/invalid role → deny everything
  for (const rule of rules) {
    if (rule.action !== '*' && rule.action !== action) continue;
    if (rule.subjects !== '*' && !rule.subjects.includes(subject)) continue;
    return true;
  }
  return false;
}

/** Roles allowed to see a nav entry / page (used for friendly 403 copy). */
export function rolesFor(action: Action, subject: Subject): Role[] {
  return (Object.keys(RULES) as Role[]).filter((role) => roleCan(role, action, subject));
}
