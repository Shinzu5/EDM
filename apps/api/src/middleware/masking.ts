/**
 * PHI masking for roles with masked clinical read (ANALYST, BILLER).
 * maskPatientForRole() returns a copy with:
 *   name      → "J*** D***"  (per-part initials, e.g. firstName "J***")
 *   DOB       → "***-**-****"
 *   phone     → "***-***-****", email/address dropped
 *   ssn       → key removed entirely (decryption only for PHYSICIAN/ADMIN/self)
 */
import type { Role } from '@medidata/shared';

/** Roles that must never receive unmasked PHI. */
export const PHI_MASKED_ROLES: readonly Role[] = ['ANALYST', 'BILLER'];

export function shouldMask(role: Role): boolean {
  return PHI_MASKED_ROLES.includes(role);
}

export interface PatientLike {
  firstName: string;
  lastName: string;
  fullNameNormalized?: string | null;
  dateOfBirth: Date | string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ssnEncrypted?: string | null;
  [key: string]: unknown;
}

const maskPart = (part: string): string => {
  const first = part.trim().charAt(0);
  return first ? `${first.toUpperCase()}***` : '***';
};

/** "Juan" "Dela Cruz" → "J*** D***" */
export function maskName(first: string, last: string): { firstName: string; lastName: string; fullName: string } {
  const f = maskPart(first);
  const l = maskPart(last);
  return { firstName: f, lastName: l, fullName: `${f} ${l}` };
}

export type MaskedPatient<T extends PatientLike> = Omit<T, 'dateOfBirth' | 'ssnEncrypted' | 'phone' | 'email' | 'address'> & {
  dateOfBirth: string;
  phone: string | null;
  email: null;
  address: null;
  masked: true;
};

export type PatientForRole<T extends PatientLike> = T | MaskedPatient<T>;

/** Mask (or pass through) a patient-shaped object for the given role. */
export function maskPatientForRole<T extends PatientLike>(patient: T, role: Role): PatientForRole<T> {
  if (!shouldMask(role)) return patient;
  const { firstName, lastName, fullName } = maskName(patient.firstName, patient.lastName);
  const { ssnEncrypted: _ssn, ...rest } = patient;
  return {
    ...rest,
    firstName,
    lastName,
    fullNameNormalized: fullName,
    dateOfBirth: '***-**-****',
    phone: '***-***-****',
    email: null,
    address: null,
    masked: true,
  } as MaskedPatient<T>;
}
