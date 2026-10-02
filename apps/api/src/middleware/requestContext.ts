import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Correlation ID for logs and audit entries (spec §17.5). Accepts a safe inbound X-Request-Id. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  req.requestId = inbound && /^[A-Za-z0-9-]{8,64}$/.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
