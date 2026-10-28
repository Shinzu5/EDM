import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function outcomes(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.outcomeKpis()));
  } catch (err) {
    next(err);
  }
}
