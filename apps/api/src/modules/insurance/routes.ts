import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const insuranceRouter: Router = Router();

// GET /api/insurance/policies — derived policies (read InsurancePolicy).
insuranceRouter.get('/policies', requireAuth, requirePermission('read', 'InsurancePolicy'), controller.listPolicies);
// GET /api/insurance/eligibility/:patientId — active policy + coverage summary.
insuranceRouter.get('/eligibility/:patientId', requireAuth, requirePermission('read', 'InsurancePolicy'), controller.eligibility);
