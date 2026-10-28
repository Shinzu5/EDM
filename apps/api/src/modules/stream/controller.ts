import type { NextFunction, Request, Response } from 'express';
import { streamEvents } from './service.js';

export async function events(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await streamEvents(req, res);
  } catch (err) {
    next(err);
  }
}
