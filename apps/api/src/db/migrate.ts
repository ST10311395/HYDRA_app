import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies pending SQL migrations in lexical order. Each file runs in its own transaction and is
 * recorded with a checksum; editing an applied migration is detected and refused (schema drift guard).
 */
export async function runMigrations(databaseUrl: string, opts: { reset?: boolean; ssl?: boolean } = {}): Promise<MigrationResult> {
  const client = new Client({ connectionString: databaseUrl, ssl: opts.ssl ? { rejectUnauthorized: true } : undefined });
  await client.connect();
  try {
    if (opts.reset) {
      await client.query('DROP SCHEMA IF EXISTS public CASCADE');
      await client.query('CREATE SCHEMA public');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name varchar(200) PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));
    const result: MigrationResult = { applied: [], skipped: [] };
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = applied.get(file);
      if (existing) {
        if (existing !== checksum) {
          throw new Error(`Migration ${file} was modified after being applied (checksum mismatch). Create a new migration instead.`);
        }
        result.skipped.push(file);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return result;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  // The migration CLI needs only the database settings — not the full application secret set —
  // so it can run from CI/CD with a narrowly scoped DATABASE_URL secret.
  const databaseUrl = process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const reset = process.argv.includes('--reset');
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  if (reset && isProduction) {
    console.error('Refusing to reset the database in production.');
    process.exit(1);
  }
  const ssl = process.env.DATABASE_SSL === 'true';
  if (isProduction && !ssl) {
    console.error('DATABASE_SSL must be true in production.');
    process.exit(1);
  }
  runMigrations(databaseUrl, { reset, ssl })
    .then((r) => {
      console.log(`Migrations applied: ${r.applied.length ? r.applied.join(', ') : 'none'} (already applied: ${r.skipped.length})`);
    })
    .catch((err: unknown) => {
      console.error((err as Error).message);
      process.exit(1);
    });
}
