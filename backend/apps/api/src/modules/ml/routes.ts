import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { risk } from './controller.js';

export const mlRouter: Router = Router();

// GET /api/ml/risk/:patientId — DQ-gated risk band + top-3 factors.
mlRouter.get('/risk/:patientId', requireAuth, requirePermission('read', 'MlRisk'), risk);
