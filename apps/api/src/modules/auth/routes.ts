import { Router } from 'express';
import { loginLimiter } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/auth.js';
import * as controller from './controller.js';

export const authRouter: Router = Router();

// POST /api/auth/login — bcrypt verify + HS256 JWT + httpOnly cookie rotation.
authRouter.post('/login', loginLimiter, controller.login);
// POST /api/auth/logout
authRouter.post('/logout', controller.logout);
// GET /api/auth/me — user + CASL ability map for the UI.
authRouter.get('/me', requireAuth, controller.me);
