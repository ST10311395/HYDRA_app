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
