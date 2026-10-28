import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const labsRouter: Router = Router();

// GET /api/labs/orders — staff read; PATIENT self-scoped in the service.
labsRouter.get('/orders', requireAuth, requirePermission('read', 'LabOrder'), controller.listOrders);
// POST /api/labs/orders — PHYSICIAN creates orders (ADMIN via manage-all).
labsRouter.post('/orders', requireAuth, requirePermission('create', 'LabOrder'), controller.createOrder);
// GET /api/labs/results — filters incl. status + TAT.
labsRouter.get('/results', requireAuth, requirePermission('read', 'LabResult'), controller.listResults);
// POST /api/labs/results/:id/review — PHYSICIAN/LAB_TECH.
labsRouter.post('/results/:id/review', requireAuth, requirePermission('review', 'LabResult'), controller.review);
// POST /api/labs/results/:id/release — PHYSICIAN/ADMIN only.
labsRouter.post('/results/:id/release', requireAuth, requirePermission('release', 'LabResult'), controller.release);
