/**
 * FHIR R4 subset routers — /fhir/Patient, /fhir/Encounter,
 * /fhir/Observation, /fhir/Claim. All require clinical read ability.
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { auditRead } from '../middleware/audit.js';
import * as service from './service.js';

const FHIR_JSON = 'application/fhir+json';

function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await fn(req);
      res.status(200).type(FHIR_JSON).json(data);
    } catch (err) {
      next(err);
    }
  };
}

export const fhirRouter: Router = Router();

fhirRouter.use(requireAuth, requirePermission('read', 'FhirResource'));

fhirRouter.get(
  '/Patient',
  handle((req) => {
    auditRead(req, { entityType: 'fhirPatient', entityId: ':search', action: 'GET /fhir/Patient (PHI read)' });
    return service.searchPatients(service.parseSearchParams(req.query as Record<string, unknown>));
  }),
);
fhirRouter.get(
  '/Encounter',
  handle((req) => {
    auditRead(req, { entityType: 'fhirEncounter', entityId: ':search', action: 'GET /fhir/Encounter (PHI read)' });
    return service.searchEncounters(service.parseSearchParams(req.query as Record<string, unknown>));
  }),
);
fhirRouter.get(
  '/Observation',
  handle((req) => {
    auditRead(req, { entityType: 'fhirObservation', entityId: ':search', action: 'GET /fhir/Observation (PHI read)' });
    return service.searchObservations(service.parseSearchParams(req.query as Record<string, unknown>));
  }),
);
fhirRouter.get(
  '/Claim',
  handle((req) => {
    auditRead(req, { entityType: 'fhirClaim', entityId: ':search', action: 'GET /fhir/Claim (PHI read)' });
    return service.searchClaims(service.parseSearchParams(req.query as Record<string, unknown>));
  }),
);
