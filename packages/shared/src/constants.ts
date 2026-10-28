/**
 * Canonical constants for the MediData platform: ports, roles, and the full
 * ENDPOINTS map of every API path. The API server and the Web app both import
 * from here so routes can never silently drift apart.
 */

export const API_BASE: string =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || 'http://localhost:4000';

export const API_PORT = Number(process.env?.API_PORT ?? 4000);
export const WEB_PORT = Number(process.env?.WEB_PORT ?? 3000);

export const ROLES = [
  'ADMIN',
  'PHYSICIAN',
  'LAB_TECH',
  'BILLER',
  'ANALYST',
  'AUDITOR',
  'PATIENT',
] as const;

export type Role = (typeof ROLES)[number];

type Endpoint = {
  /** Path, may contain :param placeholders */
  path: string;
  /** HTTP method(s) served at this path */
  method: 'GET' | 'POST' | 'GET+POST';
};

/**
 * Every route the platform exposes (REST + FHIR + integrations + ops).
 */
export const ENDPOINTS = {
  // Auth
  authLogin: { path: '/api/auth/login', method: 'POST' },
  authLogout: { path: '/api/auth/logout', method: 'POST' },
  authMe: { path: '/api/auth/me', method: 'GET' },

  // Patients / clinical
  patients: { path: '/api/patients', method: 'GET' },
  patient360: { path: '/api/patients/:id', method: 'GET' },
  encounters: { path: '/api/encounters', method: 'GET' },

  // Labs
  labOrders: { path: '/api/labs/orders', method: 'GET+POST' },
  labResults: { path: '/api/labs/results', method: 'GET' },
  labResultReview: { path: '/api/labs/results/:id/review', method: 'POST' },
  labResultRelease: { path: '/api/labs/results/:id/release', method: 'POST' },

  // Billing
  claims: { path: '/api/billing/claims', method: 'GET' },
  invoices: { path: '/api/billing/invoices', method: 'GET' },

  // Insurance
  insurancePolicies: { path: '/api/insurance/policies', method: 'GET' },
  insuranceEligibility: { path: '/api/insurance/eligibility/:patientId', method: 'GET' },

  // Patient portal
  portalRecords: { path: '/api/portal/records', method: 'GET' },
  portalResultDownload: { path: '/api/portal/results/:id/download', method: 'GET' },
  portalConsent: { path: '/api/portal/consent', method: 'GET+POST' },

  // Governance
  governanceCatalog: { path: '/api/governance/catalog', method: 'GET' },
  governanceGlossary: { path: '/api/governance/glossary', method: 'GET' },
  governanceLineage: { path: '/api/governance/lineage', method: 'GET' },
  governanceQuality: { path: '/api/governance/quality', method: 'GET' },
  governanceFreshness: { path: '/api/governance/freshness', method: 'GET' },
  governanceAudit: { path: '/api/governance/audit', method: 'GET' },

  // Admin / KPIs / ML
  adminUsers: { path: '/api/admin/users', method: 'GET+POST' },
  kpisOutcomes: { path: '/api/kpis/outcomes', method: 'GET' },
  mlRisk: { path: '/api/ml/risk/:patientId', method: 'GET' },

  // Streaming
  streamEvents: { path: '/api/stream/events', method: 'GET' },

  // FHIR R4 subset
  fhirPatient: { path: '/fhir/Patient', method: 'GET' },
  fhirEncounter: { path: '/fhir/Encounter', method: 'GET' },
  fhirObservation: { path: '/fhir/Observation', method: 'GET' },
  fhirClaim: { path: '/fhir/Claim', method: 'GET' },

  // Integrations
  hl7Adt: { path: '/integrations/hl7/adt', method: 'POST' },
  hl7Oru: { path: '/integrations/hl7/oru', method: 'POST' },
  webhooksLabResults: { path: '/webhooks/lab-results', method: 'POST' },
  webhookOutboundDeliveries: { path: '/webhooks/outbound/deliveries', method: 'GET' },

  // Ops
  openapi: { path: '/openapi.json', method: 'GET' },
  health: { path: '/health', method: 'GET' },
} as const satisfies Record<string, Endpoint>;

export type EndpointKey = keyof typeof ENDPOINTS;
