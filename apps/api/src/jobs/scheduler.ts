import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../config/logger';
import { runTask, type TaskName } from './tasks';

const SCHEDULE: Record<TaskName, string> = {
  invoiceOverdue: '15 6 * * *', // 06:15 daily
  quoteExpiry: '5 0 * * *', // 00:05 daily
  sessionCleanup: '30 2 * * *', // 02:30 daily
  orphanUploads: '0 3 * * *', // 03:00 daily
  aiReviewAgeing: '*/30 * * * *', // every 30 minutes
  aiEstimateOutcomes: '45 3 * * *', // 03:45 daily
};

/** In-process scheduler for single-instance deployments. Scale-out deployments run `npm run jobs` as a WebJob instead. */
export function startScheduler(): ScheduledTask[] {
  const tasks = (Object.keys(SCHEDULE) as TaskName[]).map((name) =>
    cron.schedule(SCHEDULE[name], () => void runTask(name).catch(() => undefined), { timezone: 'Africa/Johannesburg' }),
  );
  logger.info('Background scheduler started');
  return tasks;
}
