import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const portalRouter: Router = Router();

portalRouter.use(requireAuth, requirePermission('read', 'Portal'));

// GET /api/portal/records — self-scoped own record bundle.
portalRouter.get('/records', controller.records);
// GET /api/portal/results/:id/download — RELEASED + own + consent-gated.
portalRouter.get('/results/:id/download', controller.download);
// GET/POST /api/portal/consent — list + toggle.
portalRouter.get('/consent', controller.listConsent);
portalRouter.post('/consent', controller.toggleConsent);
