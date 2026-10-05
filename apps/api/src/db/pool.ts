/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * Microsoft. 2026. Azure Database for PostgreSQL documentation. Available at: https://learn.microsoft.com/en-us/azure/postgresql/ [Accessed 1 October 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config/env';
import { logger } from '../config/logger';

// NUMERIC -> number (values are bounded to NUMERIC(14,2)/(12,3) so double precision is exact enough),
// BIGINT counts -> number, DATE -> 'YYYY-MM-DD' string (avoid timezone shifting).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.DATE, (v) => v);

/** Minimal query surface shared by the pool and transaction clients (Repository pattern boundary). */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const cfg = config();
    pool = new Pool({
      connectionString: cfg.DATABASE_URL,
      max: cfg.DATABASE_POOL_MAX,
      ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'hydra-api',
    });
    pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

export function db(): Queryable {
  return getPool() as unknown as Queryable;
}

/**
 * Runs `work` inside a single database transaction. Any thrown error rolls back.
 * Serialization failures / deadlocks are retried a bounded number of times.
 */
export async function withTransaction<T>(work: (tx: Queryable) => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client: PoolClient = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await work(client as unknown as Queryable);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (err as { code?: string }).code;
      if ((code === '40001' || code === '40P01') && attempt < attempts) continue;
      throw err;
    } finally {
      client.release();
    }
  }
}
