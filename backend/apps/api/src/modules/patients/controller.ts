import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.ListQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listPatients(req, query)));
  } catch (err) {
    next(err);
  }
}

export async function get360(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.patient360(req, req.params.id as string)));
  } catch (err) {
    next(err);
  }
}
