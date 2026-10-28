/**
 * Central error handling: zod validation → 400, Prisma known errors →
 * 404/409, ApiError passthrough, everything else → 500 with a code.
 * Also the terminal 404 handler for unknown routes. All bodies use the
 * ApiEnvelope error shape.
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, fail } from '../lib/envelope.js';
import { toJsonSafe } from '../lib/serialize.js';

/** Prisma error codes we map explicitly (duck-typed to avoid a hard dep). */
const PRISMA_CODE_MAP: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'DUPLICATE_RECORD', message: 'A record with the same unique value already exists' },
  P2003: { status: 409, code: 'FK_CONSTRAINT_FAILED', message: 'Referenced record does not exist' },
  P2025: { status: 404, code: 'NOT_FOUND', message: 'Record not found' },
};

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(fail('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof ApiError) {
    res
      .status(err.status)
      .json({ ...fail(err.code, err.message), ...(err.details !== undefined ? { details: toJsonSafe(err.details) } : {}) });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      ...fail('VALIDATION_ERROR', 'Request validation failed'),
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    });
    return;
  }

  // Prisma known errors (PrismaClientKnownRequestError etc.) — duck-typed.
  const anyErr = err as { name?: string; code?: string; meta?: unknown } | null;
  if (anyErr && typeof anyErr.code === 'string' && PRISMA_CODE_MAP[anyErr.code]) {
    const mapped = PRISMA_CODE_MAP[anyErr.code] as { status: number; code: string; message: string };
    req.log?.warn({ err: String(err), prismaCode: anyErr.code }, 'prisma known error');
    res.status(mapped.status).json(fail(mapped.code, mapped.message));
    return;
  }

  // Malformed JSON body (express.json parse error).
  if (anyErr && (anyErr as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json(fail('BAD_JSON', 'Request body is not valid JSON'));
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  res.status(500).json(fail('INTERNAL_ERROR', 'An unexpected error occurred'));
}
