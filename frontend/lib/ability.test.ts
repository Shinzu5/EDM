import { describe, expect, it } from 'vitest';
import { roleCan, rolesFor } from './ability';

describe('lib/ability — CASL-style role rules', () => {
  it('ADMIN can do everything', () => {
    expect(roleCan('ADMIN', 'manage', 'admin')).toBe(true);
    expect(roleCan('ADMIN', 'release', 'labs')).toBe(true);
    expect(roleCan('ADMIN', 'audit', 'audit')).toBe(true);
    expect(roleCan('ADMIN', 'write', 'patients')).toBe(true);
  });

  it('PHYSICIAN gets clinical write + release, never admin/audit', () => {
    expect(roleCan('PHYSICIAN', 'release', 'labs')).toBe(true);
    expect(roleCan('PHYSICIAN', 'review', 'labs')).toBe(true);
    expect(roleCan('PHYSICIAN', 'write', 'patients')).toBe(true);
    expect(roleCan('PHYSICIAN', 'write', 'encounters')).toBe(true);
    expect(roleCan('PHYSICIAN', 'read', 'labs')).toBe(true);
    expect(roleCan('PHYSICIAN', 'read', 'billing')).toBe(true);
    expect(roleCan('PHYSICIAN', 'read', 'admin')).toBe(false);
    expect(roleCan('PHYSICIAN', 'read', 'audit')).toBe(false);
    expect(roleCan('PHYSICIAN', 'write', 'billing')).toBe(false);
  });

  it('LAB_TECH writes and reviews results but cannot release or bill', () => {
    expect(roleCan('LAB_TECH', 'write', 'labs')).toBe(true);
    expect(roleCan('LAB_TECH', 'review', 'labs')).toBe(true);
    expect(roleCan('LAB_TECH', 'release', 'labs')).toBe(false);
    expect(roleCan('LAB_TECH', 'read', 'billing')).toBe(false);
    expect(roleCan('LAB_TECH', 'write', 'patients')).toBe(false);
  });

  it('BILLER owns the revenue cycle and nothing clinical', () => {
    expect(roleCan('BILLER', 'read', 'billing')).toBe(true);
    expect(roleCan('BILLER', 'write', 'billing')).toBe(true);
    expect(roleCan('BILLER', 'read', 'insurance')).toBe(true);
    expect(roleCan('BILLER', 'read', 'labs')).toBe(false);
    expect(roleCan('BILLER', 'write', 'labs')).toBe(false);
    expect(roleCan('BILLER', 'read', 'governance')).toBe(false);
  });

  it('ANALYST reads analytics/governance but never writes PHI', () => {
    expect(roleCan('ANALYST', 'read', 'analytics')).toBe(true);
    expect(roleCan('ANALYST', 'read', 'governance')).toBe(true);
    expect(roleCan('ANALYST', 'read', 'patients')).toBe(true);
    expect(roleCan('ANALYST', 'write', 'patients')).toBe(false);
    expect(roleCan('ANALYST', 'write', 'labs')).toBe(false);
    expect(roleCan('ANALYST', 'write', 'billing')).toBe(false);
    expect(roleCan('ANALYST', 'read', 'audit')).toBe(false);
  });

  it('AUDITOR reads broadly + audit, but never writes', () => {
    expect(roleCan('AUDITOR', 'read', 'audit')).toBe(true);
    expect(roleCan('AUDITOR', 'audit', 'audit')).toBe(true);
    expect(roleCan('AUDITOR', 'read', 'billing')).toBe(true);
    expect(roleCan('AUDITOR', 'write', 'patients')).toBe(false);
    expect(roleCan('AUDITOR', 'write', 'billing')).toBe(false);
    expect(roleCan('AUDITOR', 'release', 'labs')).toBe(false);
    expect(roleCan('AUDITOR', 'read', 'admin')).toBe(false);
  });

  it('PATIENT is confined to the portal', () => {
    expect(roleCan('PATIENT', 'read', 'portal')).toBe(true);
    expect(roleCan('PATIENT', 'write', 'portal')).toBe(true);
    expect(roleCan('PATIENT', 'read', 'patients')).toBe(false);
    expect(roleCan('PATIENT', 'read', 'labs')).toBe(false);
    expect(roleCan('PATIENT', 'read', 'billing')).toBe(false);
    expect(roleCan('PATIENT', 'read', 'dashboard')).toBe(false);
    expect(roleCan('PATIENT', 'read', 'governance')).toBe(false);
  });

  it('denies everything for a missing/unknown role', () => {
    expect(roleCan(undefined, 'read', 'dashboard')).toBe(false);
    expect(roleCan(null, 'read', 'portal')).toBe(false);
    expect(roleCan('NOPE' as never, 'read', 'dashboard')).toBe(false);
  });

  it('rolesFor lists exactly the roles that may read each area', () => {
    expect(rolesFor('read', 'audit')).toEqual(['ADMIN', 'AUDITOR']);
    expect(rolesFor('read', 'admin')).toEqual(['ADMIN']);
    expect(rolesFor('read', 'portal')).toEqual(['ADMIN', 'PATIENT']);
    expect(rolesFor('release', 'labs')).toEqual(['ADMIN', 'PHYSICIAN']);
    expect(rolesFor('read', 'dashboard')).toContain('ANALYST');
    expect(rolesFor('read', 'dashboard')).not.toContain('PATIENT');
  });
});
