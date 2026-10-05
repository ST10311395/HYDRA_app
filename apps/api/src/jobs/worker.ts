/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
/**
 * One-shot task runner for Azure WebJobs / cron: `npm run jobs -- invoiceOverdue` (or no argument = all tasks).
 */
import { closePool } from '../db/pool';
import { TASKS, runTask, type TaskName } from './tasks';

async function main(): Promise<void> {
  const requested = process.argv.slice(2).filter((a) => a in TASKS) as TaskName[];
  const names = requested.length ? requested : (Object.keys(TASKS) as TaskName[]);
  for (const name of names) {
    const n = await runTask(name);
    console.log(`${name}: ${n} record(s) affected`);
  }
  await closePool();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
