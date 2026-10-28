/**
 * Request context: pino-http with a per-request id (nanoid, or the inbound
 * `x-request-id`), echoed back on the response. Custom serializers guarantee
 * Authorization/Cookie headers are NEVER logged.
 */
import pinoHttp from 'pino-http';
import { nanoid } from 'nanoid';
import { logger } from '@medidata/shared';
import { config } from '../config.js';

export const requestContext = pinoHttp({
  // Silent in tests to keep vitest output clean.
  logger: logger.child({}, { level: config.isTest ? 'silent' : config.LOG_LEVEL }),
  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];
    const id = (Array.isArray(inbound) ? inbound[0] : inbound) || nanoid(12);
    res.setHeader('x-request-id', id);
    return id;
  },
  customProps: (req) => ({ requestId: req.id }),
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/openapi.json',
  },
  serializers: {
    req(req: { method: string; url: string; id: unknown; remoteAddress?: string }) {
      return { method: req.method, url: req.url, id: req.id, remoteAddress: req.remoteAddress };
    },
    res(res: { statusCode: number }) {
      return { statusCode: res.statusCode };
    },
  },
});
