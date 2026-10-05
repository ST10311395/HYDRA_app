import {
  JOB_STATUS_LABELS,
  STATUS_MILESTONES,
  nextJobStatus,
  type JobEvent,
  type JobStatus,
} from '@hydra/shared';
import type { Queryable } from '../db/pool';
import { PostgresJobRepository, type JobRow } from '../repositories/jobRepository';
import { businessRule, conflict } from '../utils/errors';
import type { Actor } from './auditService';
import type { EventCollector } from './events';

/**
 * The single place job status changes happen (spec §24: "central transition service so controllers
 * cannot create illegal lifecycle transitions"). Also completes the server-driven milestones and
 * broadcasts realtime updates to the job's customer, electrician and admins.
 */
export async function transitionJob(
  tx: Queryable,
  events: EventCollector,
  job: JobRow,
  event: JobEvent,
  actor: Actor,
  opts: { note?: string; completedAt?: Date; cancelledReason?: string } = {},
): Promise<JobStatus> {
  const from = job.status;
  const to = nextJobStatus(from, event);
  if (!to) {
    throw businessRule(
      `This action is not allowed while the job is "${JOB_STATUS_LABELS[from]}"`,
      'ILLEGAL_JOB_TRANSITION',
    );
  }
  const repo = new PostgresJobRepository(tx);
  if (to !== from) {
    const ok = await repo.updateStatus(job.id, from, to, { completedAt: opts.completedAt, cancelledReason: opts.cancelledReason });
    if (!ok) throw conflict('This job was updated by someone else. Refresh and try again.', 'CONCURRENT_MODIFICATION');
  }
  await repo.recordStatusHistory(job.id, from, to, event, actor.userId, opts.note);
  const milestones = STATUS_MILESTONES[to];
  if (milestones?.length) await repo.completeMilestonesByCode(job.id, milestones, actor.userId);
  job.status = to;

  const payload = { jobId: job.id, reference: job.reference, status: to, previousStatus: from, event };
  events.emit(`job:${job.id}`, 'job.updated', payload);
  events.emit(`user:${job.customerUserId}`, 'job.updated', payload);
  if (job.electricianUserId) events.emit(`user:${job.electricianUserId}`, 'job.updated', payload);
  events.emit('admins', 'job.updated', payload);
  return to;
}
