import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function listPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.ListQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listPolicies(req, query)));
  } catch (err) {
    next(err);
  }
}

export async function eligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.eligibility(req, req.params.patientId as string)));
  } catch (err) {
    next(err);
  }
}
