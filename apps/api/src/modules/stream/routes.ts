import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { events } from './controller.js';

export const streamRouter: Router = Router();

// GET /api/stream/events — SSE (auth via header/cookie/`?token=`).
streamRouter.get('/events', requireAuth, requirePermission('read', 'Stream'), events);
