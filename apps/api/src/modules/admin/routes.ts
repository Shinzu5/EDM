import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const adminRouter: Router = Router();

adminRouter.use(requireAuth, requirePermission('manage', 'AdminUser'));

// GET /api/admin/users — list (hashes never returned).
adminRouter.get('/users', controller.list);
// POST /api/admin/users — create with bcrypt-hashed password + role enum.
adminRouter.post('/users', controller.create);
