/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { AssignJobInput, CheckinInput, EmployeeAvailabilityDto, QrTokenDto } from '@hydra/shared';
import { config } from '../config/env';
import { db } from '../db/pool';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresWorkforceRepository } from '../repositories/workforceRepository';
import type { AuthContext } from '../types/express';
import { randomToken, sha256 } from '../utils/crypto';
import { toBusinessDate } from '../utils/dates';
import { AppError, badRequest, businessRule, conflict, forbidden, notFound } from '../utils/errors';
import { assertAssignedEmployee, assertJobAccess } from './accessControl';
import { audit, type Actor } from './auditService';
import { transactional } from './events';
import { getJobDetail } from './jobService';
import { transitionJob } from './jobLifecycle';

const QR_PREFIX = 'HYDRA1';

/** Great-circle distance in metres (used to flag check-ins far from the recorded site). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Assign / reassign (PDF Story 2, Fig. 9). Only after quote acceptance; conflicts with other jobs,
 * events and approved leave are detected (Fig. 12 ConflictCheck) and must be explicitly overridden.
 */
export async function assignJob(auth: AuthContext, jobId: string, input: AssignJobInput, actor: Actor) {
  await transactional(async (tx, events) => {
    const jobs = new PostgresJobRepository(tx);
    const workforce = new PostgresWorkforceRepository(tx);
    const job = assertJobAccess(auth, await jobs.findById(jobId, true));
    const isReassign = job.status === 'SCHEDULED' || job.status === 'IN_PROGRESS';
    if (!isReassign && job.status !== 'QUOTE_ACCEPTED') {
      throw businessRule('An electrician can only be assigned after the customer accepts the quote', 'QUOTE_NOT_ACCEPTED');
    }
    const employee = await workforce.employee(input.employeeId);
    if (!employee || !employee.isActive) throw badRequest('Selected electrician is not available for assignment');
    const conflicts = await workforce.conflicts(employee.id, input.scheduledStart, input.scheduledEnd, jobId);
    if (conflicts.length && !input.overrideConflicts) {
      throw new AppError(
        409,
        'SCHEDULE_CONFLICT',
        `${employee.firstName} has ${conflicts.length} conflicting booking(s) in this window`,
        conflicts.map((c) => ({ path: c.type, message: `${c.title} (${c.startAt} → ${c.endAt})` })),
      );
    }
    const previousEmployeeId = job.electricianId;
    const previousUserId = job.electricianUserId;
    await jobs.setAssignment(jobId, employee.id, input.scheduledStart, input.scheduledEnd);
    await workforce.upsertJobEvent(employee.id, jobId, `${job.reference} · ${job.serviceName}`, input.scheduledStart, input.scheduledEnd, auth.userId);
    await jobs.logAssignment({
      jobId,
      assignedBy: auth.userId,
      assignedTo: employee.id,
      previousEmployeeId,
      start: input.scheduledStart,
      end: input.scheduledEnd,
      notes: input.notes,
    });
    job.electricianId = employee.id;
    job.electricianUserId = employee.userId;
    await transitionJob(tx, events, job, isReassign ? 'REASSIGN' : 'ASSIGN', actor, { note: input.notes });

    const when = new Date(input.scheduledStart).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });
    await events.notify([employee.userId], {
      type: isReassign && previousEmployeeId === employee.id ? 'SCHEDULE_CHANGED' : 'JOB_ASSIGNED',
      title: `${isReassign && previousEmployeeId === employee.id ? 'Rescheduled' : 'New job'}: ${job.reference}`,
      body: `${job.serviceName} · ${job.siteAddress} · ${when}`,
      data: { jobId },
    });
    if (previousUserId && previousEmployeeId !== employee.id) {
      await events.notify([previousUserId], {
        type: 'JOB_REASSIGNED',
        title: `${job.reference} reassigned`,
        body: 'This job has been moved to another electrician and removed from your schedule.',
        data: { jobId },
      });
      events.emit(`user:${previousUserId}`, 'schedule.updated', { jobId });
    }
    await events.notify([job.customerUserId], {
      type: 'JOB_SCHEDULED',
      title: `${job.reference} scheduled`,
      body: `${employee.firstName} ${employee.lastName} will attend on ${when}.`,
      data: { jobId },
    });
    events.emit(`user:${employee.userId}`, 'schedule.updated', { jobId });
    await audit(tx, actor, isReassign ? 'JOB_REASSIGNED' : 'JOB_ASSIGNED', 'job', jobId, {
      employeeId: employee.id,
      previousEmployeeId,
      scheduledStart: input.scheduledStart,
      conflictsOverridden: conflicts.length > 0,
    });
  });
  return getJobDetail(auth, jobId);
}

export async function availability(start: string, end: string, excludeJobId?: string): Promise<EmployeeAvailabilityDto[]> {
  const workforce = new PostgresWorkforceRepository(db());
  const employees = await workforce.listEmployees({ activeOnly: true });
  return Promise.all(
    employees.map(async (e) => {
      const conflicts = await workforce.conflicts(e.id, start, end, excludeJobId);
      return { ...e, conflicts, available: conflicts.length === 0 };
    }),
  );
}

/** Customer's secure, job-specific QR (spec §8.5): opaque random token, hashed at rest, short-lived. */
export async function issueQr(auth: AuthContext, jobId: string): Promise<QrTokenDto> {
  return transactional(async (tx) => {
    const jobs = new PostgresJobRepository(tx);
    const job = await jobs.findById(jobId, true);
    if (!job || auth.role !== 'CUSTOMER' || job.customerId !== auth.customerId) throw notFound('Job');
    if (job.status !== 'SCHEDULED') {
      throw businessRule(
        job.status === 'IN_PROGRESS' ? 'Arrival has already been confirmed for this job' : 'A QR code is available once your job is scheduled',
        'QR_NOT_AVAILABLE',
      );
    }
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + config().QR_TOKEN_TTL_MINUTES * 60_000);
    await jobs.createQrToken(jobId, sha256(token), expiresAt);
    return { jobId, jobReference: job.reference, token, payload: `${QR_PREFIX}:${jobId}:${token}`, expiresAt: expiresAt.toISOString() };
  });
}

export function parseQrPayload(raw: string): { jobId: string | null; token: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith(`${QR_PREFIX}:`)) {
    const [, jobId, token] = trimmed.split(':');
    if (!jobId || !token) throw businessRule('This QR code is not a HYDRA job code', 'QR_INVALID');
    return { jobId, token };
  }
  return { jobId: null, token: trimmed };
}

/**
 * QR arrival (PDF Story 4, spec §9.4): validates token → job → assigned employee, records a
 * timestamped GPS check-in (one per job), starts the shift if needed and moves the job to IN_PROGRESS.
 */
export async function checkIn(auth: AuthContext, jobId: string, input: CheckinInput, actor: Actor) {
  const parsed = parseQrPayload(input.qrToken);
  if (parsed.jobId && parsed.jobId !== jobId) throw businessRule('This QR code belongs to a different job', 'QR_JOB_MISMATCH');
  const result = await transactional(async (tx, events) => {
    const jobs = new PostgresJobRepository(tx);
    const token = await jobs.findQrToken(sha256(parsed.token));
    if (!token) throw businessRule('QR code not recognised. Ask the customer to refresh their code.', 'QR_INVALID');
    if (token.jobId !== jobId) throw businessRule('This QR code belongs to a different job', 'QR_JOB_MISMATCH');
    const job = await jobs.findById(jobId, true);
    if (!job) throw notFound('Job');
    const employeeId = assertAssignedEmployee(auth, job);
    if (await jobs.confirmedCheckin(jobId)) throw conflict('Arrival has already been confirmed for this job', 'ALREADY_CHECKED_IN');
    if (token.usedAt) throw conflict('This QR code has already been used', 'QR_ALREADY_USED');
    if (new Date(token.expiresAt).getTime() <= Date.now()) {
      throw businessRule('This QR code has expired. Ask the customer to refresh it in their app.', 'QR_EXPIRED');
    }
    const distance =
      job.siteLatitude !== null && job.siteLongitude !== null
        ? distanceMetres({ lat: job.siteLatitude, lng: job.siteLongitude }, { lat: input.location.latitude, lng: input.location.longitude })
        : null;
    const checkinId = await jobs.insertCheckin({
      jobId,
      employeeId,
      qrTokenId: token.id,
      method: 'QR',
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy: input.location.accuracy ?? null,
      confirmedBy: null,
      reason: distance !== null && distance > 1000 ? `Scanned ${Math.round(distance / 100) / 10}km from recorded site` : null,
    });
    await jobs.markQrTokenUsed(token.id);
    await transitionJob(tx, events, job, 'CHECK_IN', actor, { note: 'QR + GPS arrival confirmed' });

    const workforce = new PostgresWorkforceRepository(tx);
    let shiftStarted = false;
    if (!(await workforce.openShift(employeeId))) {
      await workforce.clockIn(employeeId, jobId, toBusinessDate(new Date()), `Auto clock-in on QR arrival (${job.reference})`);
      shiftStarted = true;
    }
    await events.notify([job.customerUserId], {
      type: 'CHECKED_IN',
      title: 'Your electrician has arrived',
      body: `Arrival for ${job.reference} confirmed by QR scan. Work is now in progress.`,
      data: { jobId },
    });
    await events.notifyAdmins({
      type: 'CHECKED_IN',
      title: `On site · ${job.reference}`,
      body: distance !== null && distance > 1000 ? `⚠ Check-in ${Math.round(distance)}m from site address` : 'QR + GPS arrival confirmed',
      data: { jobId },
    });
    events.emit(`job:${jobId}`, 'job.checkin', { jobId, checkinId });
    await audit(tx, actor, 'JOB_CHECKIN', 'job', jobId, { checkinId, method: 'QR', distanceMetres: distance, shiftStarted });
    return { shiftStarted, distance };
  });
  return { job: await getJobDetail(auth, jobId), shiftStarted: result.shiftStarted, distanceMetres: result.distance };
}

/** PDF Fig. 8 "AdminAssistance": when a scan repeatedly fails, an admin can confirm arrival (audited). */
export async function adminConfirmArrival(auth: AuthContext, jobId: string, reason: string, location: { latitude: number; longitude: number; accuracy?: number } | undefined, actor: Actor) {
  await transactional(async (tx, events) => {
    const jobs = new PostgresJobRepository(tx);
    const job = assertJobAccess(auth, await jobs.findById(jobId, true));
    if (!job.electricianId) throw businessRule('Assign an electrician first', 'NOT_ASSIGNED');
    if (await jobs.confirmedCheckin(jobId)) throw conflict('Arrival has already been confirmed for this job', 'ALREADY_CHECKED_IN');
    await jobs.insertCheckin({
      jobId,
      employeeId: job.electricianId,
      qrTokenId: null,
      method: 'ADMIN_OVERRIDE',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      confirmedBy: auth.userId,
      reason,
    });
    await transitionJob(tx, events, job, 'CHECK_IN', actor, { note: `Arrival confirmed by admin: ${reason}` });
    await events.notify([job.customerUserId, job.electricianUserId], {
      type: 'CHECKED_IN',
      title: `Arrival confirmed · ${job.reference}`,
      body: 'The office confirmed on-site arrival. Work is now in progress.',
      data: { jobId },
    });
    await audit(tx, actor, 'JOB_ARRIVAL_OVERRIDE', 'job', jobId, { reason });
  });
  return getJobDetail(auth, jobId);
}

export async function reportDelay(auth: AuthContext, jobId: string, minutes: number, note: string | undefined, actor: Actor) {
  await transactional(async (tx, events) => {
    const jobs = new PostgresJobRepository(tx);
    const job = await jobs.findById(jobId);
    if (!job) throw notFound('Job');
    assertAssignedEmployee(auth, job);
    if (job.status !== 'SCHEDULED') throw businessRule('Delays can be reported before arrival', 'DELAY_NOT_ALLOWED');
    const text = `Running approximately ${minutes} minutes late${note ? ` — ${note}` : ''}.`;
    await jobs.addNote(jobId, auth.userId, text, 'CUSTOMER');
    const spec = { type: 'SCHEDULE_CHANGED' as const, title: `Delay · ${job.reference}`, body: text, data: { jobId } };
    await events.notify([job.customerUserId], spec);
    await events.notifyAdmins(spec);
    events.emit(`job:${jobId}`, 'job.updated', { jobId, status: job.status, event: 'DELAY' });
    await audit(tx, actor, 'JOB_DELAY_REPORTED', 'job', jobId, { minutes });
  });
  return getJobDetail(auth, jobId);
}

export function assertEmployee(auth: AuthContext): string {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden();
  return auth.employeeId;
}
