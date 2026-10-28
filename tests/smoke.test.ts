import { describe, expect, it } from 'vitest';
import { API_BASE, ENDPOINTS, ROLES } from '../packages/shared/src/index.js';

describe('@medidata/shared contract smoke test', () => {
  it('exposes every required endpoint path', () => {
    expect(ENDPOINTS.health.path).toBe('/health');
    expect(ENDPOINTS.authLogin.path).toBe('/api/auth/login');
    expect(ENDPOINTS.fhirPatient.path).toBe('/fhir/Patient');
    expect(Object.keys(ENDPOINTS).length).toBeGreaterThanOrEqual(36);
  });

  it('has all seven roles', () => {
    expect(ROLES).toHaveLength(7);
    expect(ROLES).toContain('ADMIN');
    expect(ROLES).toContain('PATIENT');
  });

  it('defaults API_BASE to localhost:4000', () => {
    expect(API_BASE).toMatch(/localhost:4000/);
  });
});
