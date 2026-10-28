import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const encountersRouter: Router = Router();

// GET /api/encounters — filters: patientId, type, status, from/to.
encountersRouter.get('/', requireAuth, requirePermission('read', 'Encounter'), controller.list);
