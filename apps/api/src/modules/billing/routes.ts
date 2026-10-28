import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const billingRouter: Router = Router();

// GET /api/billing/claims — status/payer filters; PHI masked for BILLER/ANALYST.
billingRouter.get('/claims', requireAuth, requirePermission('read', 'Claim'), controller.listClaims);
// GET /api/billing/invoices — grouped claim totals per encounter.
billingRouter.get('/invoices', requireAuth, requirePermission('read', 'Invoice'), controller.listInvoices);
