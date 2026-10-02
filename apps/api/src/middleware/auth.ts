import type { NextFunction, Request, Response } from 'express';
import { ADMIN_ROLES, type Role } from '@hydra/shared';
import { db } from '../db/pool';
import { verifyAccessToken } from '../services/tokenService';
import type { Actor } from '../services/auditService';
import type { AuthContext } from '../types/express';
import { forbidden, unauthorized } from '../utils/errors';

function bearer(req: Request): string | null {
  const h = req.header('authorization');
  if (!h) return null;
  const m = /^Bearer\s+([A-Za-z0-9\-_.]+)$/.exec(h);
  return m?.[1] ?? null;
}

/**
 * Verifies the access token (signature, expiry, issuer, audience) and confirms the account is still
 * active and the token has not been invalidated by a password change / disable (token_version).
 */
export async function resolveAuth(token: string): Promise<AuthContext> {
  const claims = await verifyAccessToken(token);
  const { rows } = await db().query<{ status: string; tokenVersion: number; role: Role; sessionActive: boolean }>(
    `SELECT status, token_version AS "tokenVersion", role,
            EXISTS (SELECT 1 FROM refresh_tokens r WHERE r.family_id = $2 AND r.revoked_at IS NULL AND r.expires_at > now()) AS "sessionActive"
       FROM users WHERE id = $1`,
    [claims.sub, claims.sid],
  );
  const u = rows[0];
  // Logout / reuse detection / password change / disable take effect immediately, not at token expiry.
  if (!u || u.status !== 'ACTIVE' || u.tokenVersion !== claims.tv || u.role !== claims.role || !u.sessionActive) {
    throw unauthorized('Session is no longer valid. Please sign in again.');
  }
  return {
    userId: claims.sub,
    role: claims.role,
    customerId: claims.cid,
    employeeId: claims.eid,
    adminId: claims.aid,
    sessionId: claims.sid,
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req);
  if (!token) throw unauthorized();
  req.auth = await resolveAuth(token);
  next();
}

/** Attaches auth when a valid token is present; anonymous otherwise (public endpoints). */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req);
  if (token) {
    try {
      req.auth = await resolveAuth(token);
    } catch {
      req.auth = undefined;
    }
  }
  next();
}

/** Role gate — step 3 of the protected-route pipeline (spec §17.3). Ownership is checked in services. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw unauthorized();
    if (!roles.includes(req.auth.role)) throw forbidden();
    next();
  };
}

export const requireAdmin = requireRole(...ADMIN_ROLES);
export const requireOwner = requireRole('ADMIN_OWNER');

export function auth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function actorFrom(req: Request): Actor {
  return {
    userId: req.auth?.userId ?? null,
    role: req.auth?.role ?? 'GUEST',
    requestId: req.requestId,
    ip: req.ip ?? null,
    auth: req.auth,
  };
}

export const isAdmin = (a: AuthContext): boolean => ADMIN_ROLES.includes(a.role);
