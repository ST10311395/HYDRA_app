/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { Queryable } from '../db/pool';
import { PostgresAuditRepository } from '../repositories/auditRepository';
import type { AuthContext } from '../types/express';

/** Who/where context for an audited action; built from the HTTP request by controllers. */
export interface Actor {
  userId: string | null;
  role: string | null;
  requestId: string | null;
  ip: string | null;
  auth?: AuthContext;
}

export const SYSTEM_ACTOR: Actor = { userId: null, role: 'SYSTEM', requestId: null, ip: null };

const SENSITIVE_KEYS = /pass(word)?|token|secret|cvv|card|authorization|signature/i;

function scrub(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

/** Appends an audit entry in the caller's transaction so the audit record commits with the change. */
export async function audit(
  q: Queryable,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await new PostgresAuditRepository(q).append({
    actorUserId: actor.userId,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    requestId: actor.requestId,
    ip: actor.ip,
    metadata: scrub(metadata),
  });
}
