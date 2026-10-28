/**
 * Audit trail middleware — the deck's "audit everything" requirement.
 *
 * 1. Every mutation (POST/PUT/PATCH/DELETE) that responds successfully writes
 *    an `app.AuditLog` row: actor, action, entityType, entityId, before/after
 *    JSON (response snapshot), ip, user-agent. Auth login/logout and webhook
 *    ingestion are exempt (login would leak the token; ingestion writes its
 *    own OutboxEvent trail).
 * 2. auditRead() records PHI reads performed by human roles — called from
 *    services after fetching clinical data. Masked (non-PHI) reads are not
 *    recorded. Writes are fire-and-forget and can never fail a request.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '@medidata/db';
import { logger } from '@medidata/shared';
import { toJsonSafe } from '../lib/serialize.js';
import { shouldMask } from './masking.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Paths excluded from blanket mutation auditing (they log separately). */
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/webhooks/lab-results']);

/** Human roles whose unmasked reads are PHI and must be audited. */
export const PHI_READ_AUDITED_ROLES = new Set(['ADMIN', 'PHYSICIAN', 'LAB_TECH', 'AUDITOR', 'PATIENT']);

function actorFrom(req: Request): { actorUserId: string | null; actorRole: string } {
  return {
    actorUserId: req.auth?.userId ?? null,
    actorRole: req.auth?.role ?? 'ANONYMOUS',
  };
}

/** Fire-and-forget audit write — never throws into the response path. */
export function writeAudit(
  req: Request,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    beforeJson?: unknown;
    afterJson?: unknown;
  },
): void {
  const { actorUserId, actorRole } = actorFrom(req);
  void prisma.auditLog
    .create({
      data: {
        actorUserId,
        actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeJson: entry.beforeJson === undefined ? undefined : (toJsonSafe(entry.beforeJson) as never),
        afterJson: entry.afterJson === undefined ? undefined : (toJsonSafe(entry.afterJson) as never),
        ipAddress: req.ip ?? null,
        userAgent: (req.headers['user-agent'] ?? null) as string | null,
      },
    })
    .catch((err: unknown) => {
      req.log?.warn({ err }, 'audit write failed');
      logger.warn({ err: String(err) }, 'audit write failed');
    });
}

/** Record a PHI read by a human (unmasked) role. No-op for masked/anonymous. */
export function auditRead(
  req: Request,
  entry: { entityType: string; entityId?: string; action?: string },
): void {
  const role = req.auth?.role;
  if (!role || !PHI_READ_AUDITED_ROLES.has(role) || shouldMask(role)) return;
  writeAudit(req, {
    action: entry.action ?? `GET ${entry.entityType}`,
    entityType: entry.entityType,
    entityId: entry.entityId ?? '-',
  });
}

/** Derive a coarse entityType/entityId from the request path. */
function pathEntities(req: Request): { entityType: string; entityId: string } {
  const parts = req.path.split('/').filter(Boolean); // e.g. api labs results :id review
  const entityType = parts[1] ?? 'api';
  const entityId = String(req.params.id ?? req.params.patientId ?? parts.at(-1) ?? '-');
  return { entityType, entityId };
}

export const auditMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!MUTATING.has(req.method) || EXEMPT_PATHS.has(req.path)) return next();

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const success = typeof body === 'object' && body !== null && (body as { success?: boolean }).success === true;
    const routePath = req.baseUrl + (req.route?.path ?? req.path);
    const { entityType, entityId } = pathEntities(req);
    if (success) {
      writeAudit(req, {
        action: `${req.method} ${routePath}`,
        entityType,
        entityId,
        afterJson: body,
      });
    } else {
      writeAudit(req, {
        action: `${req.method} ${routePath} (rejected)`,
        entityType,
        entityId,
        afterJson: body,
      });
    }
    return originalJson(body);
  };
  next();
};
