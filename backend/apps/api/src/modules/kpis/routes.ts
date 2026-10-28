import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { outcomes } from './controller.js';

export const kpisRouter: Router = Router();

// GET /api/kpis/outcomes — OutcomeKpis (analytics package or local fallback).
kpisRouter.get('/outcomes', requireAuth, requirePermission('read', 'Kpi'), outcomes);
