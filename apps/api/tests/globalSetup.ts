/**
 * Starts a throwaway PostgreSQL cluster for the test run (real PostgreSQL, not a mock) unless
 * TEST_DATABASE_URL points at an existing server (e.g. the CI service container).
 */
import { rmSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { runMigrations } from '../src/db/migrate';

const PORT = 5434;
let pg: EmbeddedPostgres | null = null;

export async function setup(): Promise<void> {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const dir = path.resolve(__dirname, '../.pgdata-test');
    rmSync(dir, { recursive: true, force: true });
    pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: 'hydra_test',
      password: 'hydra_test_only',
      port: PORT,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => undefined,
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('hydra_test');
    url = `postgres://hydra_test:hydra_test_only@localhost:${PORT}/hydra_test`;
  }
  process.env.TEST_DATABASE_URL = url;
  await runMigrations(url, { reset: true });
}

export async function teardown(): Promise<void> {
  if (pg) await pg.stop();
}
