import type { NextFunction, Request, Response } from 'express';
import { ok } from '../../lib/envelope.js';
import * as service from './service.js';

export async function listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.OrdersQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listOrders(req, query)));
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = service.CreateOrderSchema.parse(req.body);
    res.status(201).json(ok(await service.createOrder(req, body)));
  } catch (err) {
    next(err);
  }
}

export async function listResults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = service.ResultsQuerySchema.parse(req.query);
    res.status(200).json(ok(await service.listResults(req, query)));
  } catch (err) {
    next(err);
  }
}

export async function review(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.reviewResult(req, req.params.id as string)));
  } catch (err) {
    next(err);
  }
}

export async function release(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ok(await service.releaseResult(req, req.params.id as string)));
  } catch (err) {
    next(err);
  }
}
