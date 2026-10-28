import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function listClaims(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.ClaimsQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listClaims(req, query)));
  } catch (err) {
    next(err);
  }
}

export async function listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.InvoicesQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listInvoices(req, query)));
  } catch (err) {
    next(err);
  }
}
