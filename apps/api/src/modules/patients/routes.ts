import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const patientsRouter: Router = Router();

// GET /api/patients — paginated, q= search, role-masked.
patientsRouter.get('/', requireAuth, requirePermission('read', 'Patient'), controller.list);
// GET /api/patients/:id — Patient360 aggregate.
patientsRouter.get('/:id', requireAuth, requirePermission('read', 'Patient'), controller.get360);
