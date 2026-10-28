import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as controller from './controller.js';

export const governanceRouter: Router = Router();

governanceRouter.use(requireAuth, requirePermission('read', 'Governance'));

// GET /api/governance/catalog — DataCatalog + steward names.
governanceRouter.get('/catalog', controller.catalog);
// GET /api/governance/glossary — business glossary + owners.
governanceRouter.get('/glossary', controller.glossary);
// GET /api/governance/lineage — recent 100 PipelineRuns + grouped + nodes.
governanceRouter.get('/lineage', controller.lineage);
// GET /api/governance/quality — QualityScorecard (DqResult ⋈ DqRule).
governanceRouter.get('/quality', controller.quality);
// GET /api/governance/freshness — staleness vs FreshnessSla targets.
governanceRouter.get('/freshness', controller.freshness);
// GET /api/governance/audit — AUDITOR/ADMIN only (separate subject guard).
governanceRouter.get('/audit', requirePermission('read', 'AuditLog'), controller.audit);
