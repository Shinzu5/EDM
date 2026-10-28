import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const wrap =
  (fn: (req: Request) => Promise<unknown>): Handler =>
  async (req, res, next) => {
    try {
      res.status(200).json(ok(await fn(req)));
    } catch (err) {
      next(err);
    }
  };

export const catalog = wrap(() => service.catalog());
export const glossary = wrap(() => service.glossary());
export const lineage = wrap(() => service.lineage());
export const quality = wrap((req) => service.quality(req));
export const freshness = wrap(() => service.freshness());

export async function audit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.AuditQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.auditLog(req, query)));
  } catch (err) {
    next(err);
  }
}
