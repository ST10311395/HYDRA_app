/**
 * Local PostgreSQL without Docker: downloads/launches real PostgreSQL binaries via `embedded-postgres`.
 * Data persists in apps/api/.pgdata. Keep this process running while developing (Ctrl+C to stop).
 * Credentials below are local-development only and match DATABASE_URL in .env.example.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
const dataDir = path.resolve(__dirname, '../.pgdata');

async function main(): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'hydra',
    password: 'hydra_local_dev',
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => undefined,
  });
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('Initialising local PostgreSQL cluster…');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('hydra');
  } catch {
    // database already exists
  }
  console.log(`PostgreSQL running on localhost:${port} (db: hydra). Press Ctrl+C to stop.`);
  const stop = async (): Promise<void> => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
