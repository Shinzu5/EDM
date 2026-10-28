/**
 * JWT authentication (jose, HS256, 8h) issued by POST /api/auth/login.
 * Accepted from (in order): `Authorization: Bearer <jwt>`, the httpOnly
 * `medidata_token` cookie, or a `?token=` query param (SSE feeds cannot set
 * headers). attachAuth is optional (never rejects); requireAuth guards.
 */
import { SignJWT, jwtVerify } from 'jose';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ROLES, type Role } from '@medidata/shared';
import { config } from '../config.js';
import { ApiError } from '../lib/envelope.js';

export const TOKEN_COOKIE = 'medidata_token';
const ISSUER = 'medidata-api';

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface TokenClaims {
  sub: string;
  email: string;
  fullName: string;
  role: Role;
  iss: string;
  iat: number;
  exp: number;
}

function key(): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

/** Issue an HS256 JWT for a user. `ttlSeconds` overridable for tests. */
export async function issueToken(
  user: { id: string; email: string; fullName: string; role: Role },
  ttlSeconds: number = config.JWT_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ email: user.email, fullName: user.fullName, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key());
}

/** Verify signature/expiry and return the auth context. Throws on invalid. */
export async function verifyToken(token: string): Promise<AuthContext> {
  const { payload } = await jwtVerify<TokenClaims>(token, key(), { issuer: ISSUER });
  if (!payload.sub || !payload.email || !payload.role || !ROLES.includes(payload.role)) {
    throw new Error('Malformed token claims');
  }
  return {
    userId: payload.sub,
    email: payload.email,
    fullName: payload.fullName ?? '',
    role: payload.role,
  };
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req.cookies as Record<string, string> | undefined)?.[TOKEN_COOKIE];
  if (cookie) return cookie;
  const q = typeof req.query.token === 'string' ? req.query.token : undefined;
  return q || undefined;
}

/** Optional auth: attaches req.auth when a valid token is present. */
export const attachAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) return next();
  verifyToken(token)
    .then((auth) => {
      req.auth = auth;
    })
    .catch(() => {
      /* invalid token → treat as anonymous; requireAuth will 401 */
    })
    .finally(() => next());
};

/** Hard guard: 401 without a valid token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
  next();
}
