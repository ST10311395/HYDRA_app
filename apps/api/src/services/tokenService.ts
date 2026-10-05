/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import type { Role } from '@hydra/shared';
import { config } from '../config/env';
import { hmacHex, randomToken } from '../utils/crypto';
import { unauthorized } from '../utils/errors';

export interface AccessClaims {
  sub: string;
  role: Role;
  cid: string | null;
  eid: string | null;
  aid: string | null;
  sid: string;
  tv: number;
}

export function parseDuration(value: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!m) throw new Error(`Invalid duration: ${value}`);
  const n = Number(m[1]);
  const unit = m[2] as 's' | 'm' | 'h' | 'd';
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[unit] * 1000;
}

const key = (secret: string) => new TextEncoder().encode(secret);

/** Short-lived HS256 access token carrying only the claims needed for authorisation (PDF §6.1.3). */
export async function signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
  const cfg = config();
  const ttl = parseDuration(cfg.JWT_ACCESS_TTL);
  const expiresAt = new Date(Date.now() + ttl);
  const token = await new SignJWT({
    role: claims.role,
    cid: claims.cid,
    eid: claims.eid,
    aid: claims.aid,
    sid: claims.sid,
    tv: claims.tv,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(cfg.JWT_ISSUER)
    .setAudience(cfg.JWT_AUDIENCE)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key(cfg.jwtAccessSecret));
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const cfg = config();
  try {
    const { payload } = await jwtVerify(token, key(cfg.jwtAccessSecret), {
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.role !== 'string' || typeof payload.sid !== 'string') {
      throw unauthorized('Invalid access token');
    }
    return {
      sub: payload.sub,
      role: payload.role as Role,
      cid: (payload.cid as string | null) ?? null,
      eid: (payload.eid as string | null) ?? null,
      aid: (payload.aid as string | null) ?? null,
      sid: payload.sid,
      tv: Number(payload.tv ?? 0),
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw unauthorized('Access token expired');
    if (err instanceof Error && err.name === 'AppError') throw err;
    throw unauthorized('Invalid access token');
  }
}

/** Refresh tokens are opaque random strings; only a keyed hash (HMAC with the refresh secret) is persisted. */
export function newRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomToken(48);
  return {
    token,
    hash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + parseDuration(config().JWT_REFRESH_TTL)),
  };
}

export function hashRefreshToken(token: string): string {
  return hmacHex('sha256', config().jwtRefreshSecret, token);
}
