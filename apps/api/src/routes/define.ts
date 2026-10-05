/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import type { Role } from '@hydra/shared';
import { z } from 'zod';
import { db } from '../db/pool';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sha256 } from '../utils/crypto';
import { AppError, badRequest, conflict } from '../utils/errors';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();
export const API_PREFIX = '/api/v1';

registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });

const ErrorSchema = registry.register(
  'Error',
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string().optional(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  }),
);

type Access = 'public' | 'optional' | 'authenticated' | readonly Role[];

export interface RouteSpec<B extends z.ZodType | undefined, Q extends z.ZodType | undefined, P extends z.ZodType | undefined> {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  body?: B;
  query?: Q;
  params?: P;
  status?: number;
  /** Extra middleware (rate limiters, uploads) run after auth, before validation. */
  pre?: RequestHandler[];
  /** Non-JSON responses (files, redirects) are sent by the handler itself. */
  raw?: boolean;
  responseDescription?: string;
  /**
   * Honour an `Idempotency-Key` header for this authenticated write (spec §20): a retried or
   * double-tapped request with the same key replays the first response instead of creating a
   * duplicate. Keys are scoped per user and expire after 2 days (cleanup task).
   */
  idempotent?: boolean;
}

const KEY_FORMAT = /^[A-Za-z0-9_-]{8,100}$/;

type Replay = { status: number; body: unknown } | null;

/** Claims the key for this request, or returns the stored response of the earlier identical one. */
async function claimIdempotencyKey(userId: string, key: string, route: string, body: unknown): Promise<Replay> {
  const hash = sha256(JSON.stringify(body ?? null));
  const claimed = await db().query(
    `INSERT INTO idempotency_keys (key, user_id, route, request_hash) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [key, userId, route, hash],
  );
  if (claimed.rowCount === 1) return null;
  const { rows } = await db().query<{ route: string; requestHash: string; statusCode: number | null; responseBody: unknown }>(
    `SELECT route, request_hash AS "requestHash", status_code AS "statusCode", response_body AS "responseBody" FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
    [userId, key],
  );
  const prior = rows[0];
  if (!prior) return claimIdempotencyKey(userId, key, route, body); // released concurrently: claim again
  if (prior.route !== route || prior.requestHash !== hash) throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This request key was already used for a different request.');
  if (prior.statusCode === null) throw conflict('This request is already being processed.', 'REQUEST_IN_PROGRESS');
  return { status: prior.statusCode, body: prior.responseBody };
}

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined;

export interface Validated<B, Q, P> {
  body: B;
  query: Q;
  params: P;
}

/**
 * Declares an endpoint once: Express route + auth/role guard + Zod validation + OpenAPI entry.
 * Pipeline per spec §17.3: authenticate → verify token → role check → (service) ownership → validate → logic → audit.
 */
export function defineRoute<B extends z.ZodType | undefined = undefined, Q extends z.ZodType | undefined = undefined, P extends z.ZodType | undefined = undefined>(
  router: Router,
  spec: RouteSpec<B, Q, P>,
  handler: (req: Request, input: Validated<Infer<B>, Infer<Q>, Infer<P>>, res: Response) => Promise<unknown> | unknown,
): void {
  const guards: RequestHandler[] = [];
  if (spec.access === 'optional') guards.push(optionalAuth as RequestHandler);
  else if (spec.access !== 'public') {
    guards.push(authenticate as RequestHandler);
    if (Array.isArray(spec.access)) guards.push(requireRole(...(spec.access as Role[])));
  }
  const run = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const input = {
      params: (spec.params ? validate(spec.params, req.params) : undefined) as Infer<P>,
      query: (spec.query ? validate(spec.query, req.query) : undefined) as Infer<Q>,
      body: (spec.body ? validate(spec.body, req.body ?? {}) : undefined) as Infer<B>,
    };
    const key = spec.idempotent && req.auth ? req.header('idempotency-key') : undefined;
    if (key !== undefined && !KEY_FORMAT.test(key)) throw badRequest('Invalid Idempotency-Key header');
    const route = `${spec.method.toUpperCase()} ${req.originalUrl.split('?')[0]}`;
    if (key) {
      const replay = await claimIdempotencyKey(req.auth!.userId, key, route, input.body);
      if (replay) {
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(replay.status).json(replay.body);
        return;
      }
    }
    let result: unknown;
    try {
      result = await handler(req, input, res);
    } catch (e) {
      // Failed attempts are not remembered, so the client can retry with the same key.
      if (key) await db().query('DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2', [req.auth!.userId, key]);
      throw e;
    }
    if (key) {
      await db().query('UPDATE idempotency_keys SET status_code = $3, response_body = $4 WHERE user_id = $1 AND key = $2', [
        req.auth!.userId, key, spec.status ?? (result === undefined ? 204 : 200), result === undefined ? null : JSON.stringify(result),
      ]);
    }
    if (spec.raw || res.headersSent) return;
    if (result === undefined) {
      res.status(spec.status ?? 204).end();
      return;
    }
    res.status(spec.status ?? 200).json(result);
    void next;
  };
  router[spec.method](spec.path, ...guards, ...(spec.pre ?? []), run);

  const oaPath = `${API_PREFIX}${spec.path}`.replace(/:([A-Za-z]+)/g, '{$1}').replace(/\*[A-Za-z]*/g, '{path}');
  const roles = Array.isArray(spec.access) ? ` Roles: ${(spec.access as Role[]).join(', ')}.` : spec.access === 'public' ? ' Public.' : '';
  try {
    registry.registerPath({
      method: spec.method,
      path: oaPath,
      tags: [spec.tag],
      summary: spec.summary,
      description: `${spec.description ?? ''}${roles}`.trim(),
      security: spec.access === 'public' ? [] : [{ bearerAuth: [] }],
      request: {
        ...(spec.params ? { params: spec.params as unknown as z.ZodObject } : {}),
        ...(spec.query ? { query: spec.query as unknown as z.ZodObject } : {}),
        ...(spec.body ? { body: { content: { 'application/json': { schema: spec.body } } } } : {}),
      },
      responses: {
        [spec.status ?? 200]: { description: spec.responseDescription ?? 'Success' },
        400: { description: 'Bad request', content: { 'application/json': { schema: ErrorSchema } } },
        401: { description: 'Authentication required', content: { 'application/json': { schema: ErrorSchema } } },
        403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorSchema } } },
        404: { description: 'Not found (also returned for records owned by another account)', content: { 'application/json': { schema: ErrorSchema } } },
        422: { description: 'Validation or business-rule failure', content: { 'application/json': { schema: ErrorSchema } } },
      },
    });
  } catch {
    // Documentation generation must never break routing.
  }
}
