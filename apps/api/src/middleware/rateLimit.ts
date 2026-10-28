/**
 * Rate limiting (express-rate-limit). Generous global limit for the demo,
 * stricter limit on login. Disabled under NODE_ENV=test so supertest suites
 * never flake.
 */
import { rateLimit } from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { fail } from '../lib/envelope.js';

const handler =
  (message: string) =>
  (_req: Request, res: Response, _next: NextFunction): void => {
    res.status(429).json(fail('RATE_LIMITED', message));
  };

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: handler('Too many requests, please retry later.'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: handler('Too many login attempts, please retry later.'),
});
