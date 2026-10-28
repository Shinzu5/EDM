import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function risk(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.riskScore(req, req.params.patientId as string)));
  } catch (err) {
    next(err);
  }
}
