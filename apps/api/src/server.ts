import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import { closePool } from './db/pool';
import { runMigrations } from './db/migrate';
import { startScheduler } from './jobs/scheduler';
import { attachRealtime } from './realtime/socket';

async function main(): Promise<void> {
  const cfg = config();
  if (!cfg.isProduction) {
    // Local convenience: keep the schema current. Production runs migrations as a pipeline step.
    const r = await runMigrations(cfg.DATABASE_URL, { ssl: cfg.DATABASE_SSL });
    if (r.applied.length) logger.info({ applied: r.applied }, 'Applied pending migrations');
  }
  const server = createServer(createApp());
  const io = attachRealtime(server);
  const tasks = cfg.DISABLE_SCHEDULER ? [] : startScheduler();
  server.listen(cfg.PORT, cfg.HOST, () => {
    logger.info(`HYDRA API listening on ${cfg.HOST}:${cfg.PORT} (docs: /api/docs)`);
    if (!cfg.isProduction && cfg.HOST === '0.0.0.0') {
      for (const ip of lanAddresses())
        logger.info(`LAN (physical devices): http://${ip}:${cfg.PORT}`);
    }
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    tasks.forEach((t) => void t.stop());
    void io.close();
    server.close(() => void closePool().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
}

/** Non-internal IPv4 addresses — the URLs a phone on the same Wi-Fi can use (EXPO_PUBLIC_API_URL). */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
