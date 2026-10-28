/**
 * Auth controllers — thin handlers over the service. Passwords are never
 * written to logs or audit rows (login/logout are audit-exempt).
 */
import type { Request, Response, NextFunction } from 'express';
import { LoginRequestSchema } from '@medidata/shared';
import { config } from '../../config.js';
import { ok } from '../../lib/envelope.js';
import { TOKEN_COOKIE } from '../../middleware/auth.js';
import * as service from './service.js';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = LoginRequestSchema.parse(req.body);
    const { user, token } = await service.login(email, password);
    res.cookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/',
      maxAge: config.jwtTtlMs,
    });
    req.log?.info({ userId: user.id, role: user.role }, 'login success'); // never the password
    res.status(200).json(ok({ user, token }));
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.status(200).json(ok({ loggedOut: true }));
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.me(req.auth!);
    res.status(200).json(ok(data));
  } catch (err) {
    next(err);
  }
}
