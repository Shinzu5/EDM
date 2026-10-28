import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function records(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.records(req)));
  } catch (err) {
    next(err);
  }
}

export async function download(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.downloadResult(req, req.params.id as string)));
  } catch (err) {
    next(err);
  }
}

export async function listConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.listConsents(req)));
  } catch (err) {
    next(err);
  }
}

export async function toggleConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = service.ConsentToggleSchema.parse(req.body);
    res.status(200).json(ok(await service.toggleConsent(req, body)));
  } catch (err) {
    next(err);
  }
}
