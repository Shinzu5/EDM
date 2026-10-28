import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.ListQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listUsers(query)));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = service.CreateUserSchema.parse(req.body);
    res.status(201).json(ok(await service.createUser(body)));
  } catch (err) {
    next(err);
  }
}
