/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@hydra/shared';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

function send(res: Response, req: Request, status: number, code: string, message: string, details?: ApiErrorBody['error']['details']): void {
  const body: ApiErrorBody = { error: { code, message, requestId: req.requestId, ...(details ? { details } : {}) } };
  res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  send(res, req, 404, 'ROUTE_NOT_FOUND', 'The requested endpoint does not exist');
}

/**
 * Single structured error format. Raw SQL errors and stack traces are never returned to clients (spec §22).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, requestId: req.requestId }, err.message);
    return send(res, req, err.status, err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    return send(res, req, 422, 'VALIDATION_FAILED', 'Some fields need attention',
      err.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })));
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return send(res, req, tooLarge ? 413 : 400, tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_REJECTED',
      tooLarge ? 'File exceeds the maximum allowed size' : 'Upload rejected');
  }
  const e = err as { type?: string; status?: number; code?: string; constraint?: string };
  if (e.type === 'entity.parse.failed') return send(res, req, 400, 'MALFORMED_JSON', 'Request body is not valid JSON');
  if (e.type === 'entity.too.large') return send(res, req, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  // PostgreSQL integrity errors → safe, generic messages.
  switch (e.code) {
    case '23505':
      return send(res, req, 409, 'DUPLICATE', 'A record with these details already exists');
    case '23503':
      return send(res, req, 409, 'REFERENCE_CONFLICT', 'This action conflicts with related records');
    case '23514':
    case '23502':
      logger.warn({ constraint: e.constraint, requestId: req.requestId }, 'Constraint rejected write');
      return send(res, req, 422, 'CONSTRAINT_VIOLATION', 'The request violates a business rule');
    case 'P0001':
      return send(res, req, 422, 'BUSINESS_RULE_VIOLATION', 'This record can no longer be changed');
    case '22P02':
      return send(res, req, 400, 'BAD_REQUEST', 'Invalid identifier or value');
    default:
      break;
  }
  logger.error({ err, requestId: req.requestId, path: req.path }, 'Unhandled error');
  send(res, req, 500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
}
