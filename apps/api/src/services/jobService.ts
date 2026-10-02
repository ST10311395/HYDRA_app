import type {
  AdminDashboardDto,
  CreateJobInput,
  InspectionReportDto,
  JobDetailDto,
  JobListQuery,
  JobStatus,
  JobSummaryDto,
  Paginated,
  SubmitInspectionInput,
} from '@hydra/shared';
import { EMPLOYEE_MANUAL_MILESTONES, JOB_STATUS_LABELS, adminCreateJobSchema } from '@hydra/shared';
import type { z } from 'zod';
import { db, type Queryable } from '../db/pool';
import { PostgresBillingRepository } from '../repositories/billingRepository';
import { PostgresContentRepository } from '../repositories/contentRepository';
import { PostgresFileRepository } from '../repositories/fileRepository';
import { PostgresInspectionRepository, type InspectionRow } from '../repositories/inspectionRepository';
import { PostgresJobRepository, type JobRow } from '../repositories/jobRepository';
import { PostgresMaterialRepository } from '../repositories/materialRepository';
import { PostgresQuoteRepository } from '../repositories/quoteRepository';
import { PostgresWorkforceRepository } from '../repositories/workforceRepository';
import type { AuthContext } from '../types/express';
import { badRequest, businessRule, forbidden, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { assertJobAccess, canAccessJob, isAdminRole } from './accessControl';
import { audit, type Actor } from './auditService';
import { transactional } from './events';
import { assertOwnUnattachedFiles, fileRefs } from './fileService';
import { transitionJob } from './jobLifecycle';

const CUSTOMER_CANCELLABLE: JobStatus[] = ['REQUESTED', 'QUOTED', 'QUOTE_DECLINED', 'QUOTE_ACCEPTED'];
const ADMIN_CANCELLABLE: JobStatus[] = ['REQUESTED', 'QUOTED', 'QUOTE_DECLINED', 'QUOTE_ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'];

async function loadJob(q: Queryable, id: string, forUpdate = false): Promise<JobRow | null> {
  return new PostgresJobRepository(q).findById(id, forUpdate);
}

export async function createJob(auth: AuthContext, input: CreateJobInput, actor: Actor): Promise<JobDetailDto> {
  if (!auth.customerId) throw forbidden('Only customers can request services');
  const jobId = await createJobInternal(auth, auth.customerId, input, 'APP', actor);
  return getJobDetail(auth, jobId);
}

export async function adminCreateJob(auth: AuthContext, input: z.infer<typeof adminCreateJobSchema>, actor: Actor): Promise<JobDetailDto> {
  const jobId = await createJobInternal(auth, input.customerId, input, 'ADMIN', actor);
  return getJobDetail(auth, jobId);
}

async function createJobInternal(
  auth: AuthContext,
  customerId: string,
  input: Omit<CreateJobInput, 'contactConfirmed'>,
  source: 'APP' | 'ADMIN',
  actor: Actor,
): Promise<string> {
  return transactional(async (tx, events) => {
    const service = await new PostgresContentRepository(tx).getServiceType(input.serviceTypeId);
    if (!service || !service.isActive) throw badRequest('Selected service type is not available');
    await assertOwnUnattachedFiles(tx, auth, input.attachmentIds, ['JOB_PHOTO']);
    const repo = new PostgresJobRepository(tx);
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM customers WHERE id = $1', [customerId]);
    if (!rows[0]) throw notFound('Customer');
    const jobId = await repo.insert({
      customerId,
      serviceTypeId: input.serviceTypeId,
      siteAddress: input.siteAddress,
      siteLatitude: input.siteLocation?.latitude ?? null,
      siteLongitude: input.siteLocation?.longitude ?? null,
      description: input.description,
      urgency: input.urgency,
      source,
      contactPhone: input.contactPhone ?? null,
      preferredDate: input.preferredDate ?? null,
      preferredTimeWindow: input.preferredTimeWindow,
    });
    await repo.createMilestones(jobId);
    await repo.completeMilestonesByCode(jobId, ['REQUESTED'], auth.userId);
    await repo.recordStatusHistory(jobId, null, 'REQUESTED', 'CREATE', auth.userId);
    for (const fileId of input.attachmentIds) await repo.addAttachment(jobId, fileId, auth.userId);
    const job = (await repo.findById(jobId))!;
    const emergency = input.urgency === 'EMERGENCY';
    await events.notifyAdmins({
      type: 'NEW_JOB_REQUEST',
      title: `${emergency ? '🚨 EMERGENCY · ' : ''}New ${service.name} request`,
      body: `${job.reference} · ${input.siteAddress}`,
      data: { jobId, route: `/admin/jobs/${jobId}` },
    });
    events.emit('admins', 'job.updated', { jobId, status: 'REQUESTED', reference: job.reference });
    await audit(tx, actor, 'JOB_CREATED', 'job', jobId, { source, urgency: input.urgency, serviceTypeId: input.serviceTypeId });
    return jobId;
  });
}

export async function listJobs(auth: AuthContext, q: JobListQuery): Promise<Paginated<JobSummaryDto>> {
  const repo = new PostgresJobRepository(db());
  const scope: { customerId?: string; electricianId?: string } = {};
  if (auth.role === 'CUSTOMER') scope.customerId = auth.customerId ?? '00000000-0000-0000-0000-000000000000';
  else if (auth.role === 'EMPLOYEE') scope.electricianId = auth.employeeId ?? '00000000-0000-0000-0000-000000000000';
  else {
    if (q.customerId) scope.customerId = q.customerId;
    if (q.employeeId) scope.electricianId = q.employeeId;
  }
  const { items, total } = await repo.list({
    ...scope,
    statuses: q.status,
    serviceTypeId: q.serviceTypeId,
    urgency: q.urgency,
    from: q.from,
    to: q.to,
    search: q.search,
    sort: q.sort,
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
  });
  return paginated(items, q.page, q.pageSize, total);
}

async function toInspectionDto(q: Queryable, row: InspectionRow): Promise<InspectionReportDto> {
  const [attachments, docs] = await Promise.all([
    fileRefs(q, row.attachmentFileIds),
    row.documentFileId ? fileRefs(q, [row.documentFileId]) : Promise.resolve([]),
  ]);
  return {
    id: row.id,
    jobId: row.jobId,
    jobReference: row.jobReference,
    employeeName: row.employeeName,
    inspectionDate: row.inspectionDate,
    complianceStatus: row.complianceStatus,
    certificateNumber: row.certificateNumber,
    findings: row.findings,
    notes: row.notes,
    checklist: row.checklist,
    signatureName: row.signatureName,
    submittedAt: new Date(row.submittedAt).toISOString(),
    attachments,
    document: docs[0] ?? null,
  };
}

function allowedActions(auth: AuthContext, job: JobRow, hasInvoice: boolean, invoiceDue: boolean): string[] {
  const a: string[] = ['ADD_NOTE'];
  const s = job.status;
  if (auth.role === 'CUSTOMER') {
    if (s === 'QUOTED') a.push('ACCEPT_QUOTE', 'DECLINE_QUOTE');
    if (s === 'SCHEDULED') a.push('SHOW_QR');
    if (invoiceDue) a.push('PAY_INVOICE');
    if (CUSTOMER_CANCELLABLE.includes(s)) a.push('CANCEL');
    a.push('ADD_PHOTOS');
  } else if (auth.role === 'EMPLOYEE') {
    if (s === 'SCHEDULED') a.push('CHECK_IN', 'REPORT_DELAY');
    if (s === 'IN_PROGRESS') a.push('LOG_MATERIALS', 'ADD_MILESTONE', 'COMPLETE_MILESTONE', 'COMPLETE_WORK', 'ADD_PHOTOS');
    if (s === 'INSPECTION_PENDING') a.push('LOG_MATERIALS', 'SUBMIT_INSPECTION', 'ADD_PHOTOS');
  } else {
    if (['REQUESTED', 'QUOTED', 'QUOTE_DECLINED'].includes(s)) a.push('CREATE_QUOTE');
    if (s === 'QUOTE_ACCEPTED') a.push('ASSIGN');
    if (s === 'SCHEDULED' || s === 'IN_PROGRESS') a.push('REASSIGN');
    if (s === 'SCHEDULED') a.push('CONFIRM_ARRIVAL');
    if (s === 'IN_PROGRESS' || s === 'INSPECTION_PENDING') a.push('LOG_MATERIALS');
    if (s === 'COMPLETED' && !hasInvoice) a.push('GENERATE_INVOICE');
    if (ADMIN_CANCELLABLE.includes(s)) a.push('CANCEL');
  }
  return a;
}

export async function getJobDetail(auth: AuthContext, jobId: string): Promise<JobDetailDto> {
  const q = db();
  const repo = new PostgresJobRepository(q);
  const job = assertJobAccess(auth, await repo.findById(jobId));
  const staffView = auth.role !== 'CUSTOMER';
  const financialView = auth.role !== 'EMPLOYEE';
  const [summary, milestones, checkins, notes, attachmentIds, materials, inspectionRows, quote, invoiceRow, assignments] = await Promise.all([
    repo.summary(jobId),
    repo.listMilestones(jobId),
    repo.listCheckins(jobId),
    repo.listNotes(jobId, staffView),
    repo.attachmentFileIds(jobId),
    new PostgresMaterialRepository(q).jobMaterials(jobId),
    new PostgresInspectionRepository(q).forJob(jobId),
    financialView ? new PostgresQuoteRepository(q).latestForJob(jobId, auth.role === 'CUSTOMER') : Promise.resolve(null),
    financialView ? new PostgresBillingRepository(q).findInvoiceByJob(jobId) : Promise.resolve(null),
    isAdminRole(auth) ? repo.listAssignments(jobId) : Promise.resolve(null),
  ]);
  const invoice = invoiceRow && !(auth.role === 'CUSTOMER' && invoiceRow.status === 'DRAFT') ? invoiceRow : null;
  const arrival = checkins[0];
  let timeOnSiteMinutes: number | null = null;
  if (arrival) {
    const end = job.completedAt ?? (job.status === 'IN_PROGRESS' ? new Date() : null);
    if (end) timeOnSiteMinutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(arrival.scannedAt).getTime()) / 60000));
  }
  const invoiceDue = !!invoice && ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) && invoice.amountDue > 0;
  return {
    ...summary!,
    description: job.description,
    siteLatitude: job.siteLatitude,
    siteLongitude: job.siteLongitude,
    preferredTimeWindow: job.preferredTimeWindow,
    source: job.source,
    materialsCost: financialView ? job.materialsCost : 0,
    cancelledReason: job.cancelledReason,
    completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    milestones,
    checkins,
    notes,
    attachments: await fileRefs(q, attachmentIds),
    materials: financialView ? materials : materials.map((m) => ({ ...m, costAtTime: 0, lineCost: 0 })),
    inspections: await Promise.all(inspectionRows.map((r) => toInspectionDto(q, r))),
    quote,
    invoice: invoice ? { id: invoice.id, number: invoice.number, status: invoice.status, total: invoice.total, amountDue: invoice.amountDue } : null,
    assignmentHistory: assignments,
    timeOnSiteMinutes,
    allowedActions: allowedActions(auth, job, !!invoiceRow, invoiceDue),
  };
}

export async function addNote(auth: AuthContext, jobId: string, body: string, visibility: 'INTERNAL' | 'CUSTOMER', actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId));
    const vis = auth.role === 'CUSTOMER' ? 'CUSTOMER' : visibility;
    await new PostgresJobRepository(tx).addNote(jobId, auth.userId, body, vis);
    if (auth.role === 'CUSTOMER') {
      await events.notify([job.electricianUserId], { type: 'ADMIN_NOTE', title: `Customer message · ${job.reference}`, body: body.slice(0, 140), data: { jobId } });
      await events.notifyAdmins({ type: 'ADMIN_NOTE', title: `Customer message · ${job.reference}`, body: body.slice(0, 140), data: { jobId } });
    } else if (vis === 'CUSTOMER') {
      await events.notify([job.customerUserId], { type: 'ADMIN_NOTE', title: `Update on ${job.reference}`, body: body.slice(0, 140), data: { jobId } });
    } else if (isAdminRole(auth) && job.electricianUserId) {
      await events.notify([job.electricianUserId], { type: 'ADMIN_NOTE', title: `Office note · ${job.reference}`, body: body.slice(0, 140), data: { jobId } });
    }
    events.emit(`job:${jobId}`, 'job.updated', { jobId, reference: job.reference, status: job.status, event: 'NOTE' });
    await audit(tx, actor, 'JOB_NOTE_ADDED', 'job', jobId, { visibility: vis });
  });
  return getJobDetail(auth, jobId);
}

export async function addAttachments(auth: AuthContext, jobId: string, fileIds: string[], actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId));
    if (['PAID', 'CANCELLED'].includes(job.status)) throw businessRule('Photos cannot be added to a closed job');
    await assertOwnUnattachedFiles(tx, auth, fileIds, ['JOB_PHOTO', 'INSPECTION_EVIDENCE']);
    const repo = new PostgresJobRepository(tx);
    for (const id of fileIds) await repo.addAttachment(jobId, id, auth.userId);
    events.emit(`job:${jobId}`, 'job.updated', { jobId, reference: job.reference, status: job.status, event: 'ATTACHMENT' });
    await audit(tx, actor, 'JOB_ATTACHMENTS_ADDED', 'job', jobId, { count: fileIds.length });
  });
  return getJobDetail(auth, jobId);
}

export async function cancelJob(auth: AuthContext, jobId: string, reason: string, actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId, true));
    if (auth.role === 'EMPLOYEE') throw forbidden('Electricians cannot cancel jobs. Contact the office.');
    if (auth.role === 'CUSTOMER' && !CUSTOMER_CANCELLABLE.includes(job.status)) {
      throw businessRule('This job can no longer be cancelled from the app. Please contact the office.', 'CANCELLATION_NOT_ALLOWED');
    }
    await transitionJob(tx, events, job, 'CANCEL', actor, { note: reason, cancelledReason: reason });
    await new PostgresQuoteRepository(tx).supersedeOpen(jobId);
    await new PostgresWorkforceRepository(tx).deleteJobEvent(jobId);
    const spec = { type: 'SYSTEM' as const, title: `Job ${job.reference} cancelled`, body: reason.slice(0, 200), data: { jobId } };
    await events.notify([job.customerUserId, job.electricianUserId].filter((u) => u !== auth.userId), spec);
    if (auth.role === 'CUSTOMER') await events.notifyAdmins(spec);
    await audit(tx, actor, 'JOB_CANCELLED', 'job', jobId, { reason });
  });
  return getJobDetail(auth, jobId);
}

export async function addMilestone(auth: AuthContext, jobId: string, m: { name: string; description?: string; plannedDate?: string }, actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId));
    if (auth.role === 'CUSTOMER') throw forbidden();
    if (job.status !== 'IN_PROGRESS') throw businessRule('Milestones can be added while work is in progress', 'JOB_NOT_IN_PROGRESS');
    const created = await new PostgresJobRepository(tx).addMilestone(jobId, m);
    events.emit(`job:${jobId}`, 'job.milestone', { jobId, milestone: created as unknown as Record<string, unknown> });
    events.emit(`user:${job.customerUserId}`, 'job.milestone', { jobId });
    await audit(tx, actor, 'MILESTONE_ADDED', 'job', jobId, { name: m.name });
  });
  return getJobDetail(auth, jobId);
}

export async function completeMilestone(auth: AuthContext, jobId: string, milestoneId: string, note: string | undefined, actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId));
    if (auth.role === 'CUSTOMER') throw forbidden();
    if (!['IN_PROGRESS', 'INSPECTION_PENDING'].includes(job.status)) throw businessRule('Milestones can be completed while work is in progress', 'JOB_NOT_IN_PROGRESS');
    const repo = new PostgresJobRepository(tx);
    const target = (await repo.listMilestones(jobId)).find((x) => x.id === milestoneId);
    if (!target) throw notFound('Milestone');
    // Lifecycle milestones (Quote, Scheduled, Arrived, Completed, Invoice, Paid…) follow the job's
    // real status for everyone, admins included, so the customer's timeline can never show a future
    // step as done. Only the on-site steps and custom (uncoded) milestones are marked by hand.
    if (target.code && !EMPLOYEE_MANUAL_MILESTONES.includes(target.code as never)) {
      throw businessRule('This milestone is completed automatically by the system', 'MILESTONE_AUTOMATIC');
    }
    const done = await repo.completeMilestone(jobId, milestoneId, auth.userId);
    if (!done) throw businessRule('Milestone is already complete', 'MILESTONE_ALREADY_COMPLETE');
    if (note) await repo.addNote(jobId, auth.userId, `${done.name}: ${note}`, 'CUSTOMER');
    await events.notify([job.customerUserId], {
      type: 'MILESTONE_UPDATED',
      title: `${job.reference}: ${done.name} ✓`,
      body: note ?? `Your electrician completed "${done.name}".`,
      data: { jobId },
    });
    events.emit(`job:${jobId}`, 'job.milestone', { jobId, milestoneId, status: 'COMPLETED' });
    await audit(tx, actor, 'MILESTONE_COMPLETED', 'job', jobId, { milestone: done.name });
  });
  return getJobDetail(auth, jobId);
}

export async function completeWork(auth: AuthContext, jobId: string, summary: string | undefined, actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId, true));
    if (auth.role !== 'EMPLOYEE' || job.electricianId !== auth.employeeId) throw forbidden('Only the assigned electrician can complete the work');
    await transitionJob(tx, events, job, 'COMPLETE_WORK', actor, { note: summary, completedAt: new Date() });
    if (summary) await new PostgresJobRepository(tx).addNote(jobId, auth.userId, `Work summary: ${summary}`, 'CUSTOMER');
    await events.notifyAdmins({ type: 'JOB_COMPLETED', title: `Work finished · ${job.reference}`, body: 'Inspection & compliance report pending', data: { jobId } });
    await events.notify([job.customerUserId], {
      type: 'MILESTONE_UPDATED',
      title: `${job.reference}: work finished`,
      body: 'Your electrician is completing the safety inspection and compliance report.',
      data: { jobId },
    });
    await audit(tx, actor, 'JOB_WORK_COMPLETED', 'job', jobId);
  });
  return getJobDetail(auth, jobId);
}

export async function submitInspection(auth: AuthContext, jobId: string, input: SubmitInspectionInput, actor: Actor) {
  await transactional(async (tx, events) => {
    const job = assertJobAccess(auth, await loadJob(tx, jobId, true));
    if (auth.role !== 'EMPLOYEE' || job.electricianId !== auth.employeeId) throw forbidden('Only the assigned electrician can submit the inspection');
    if (job.status !== 'INSPECTION_PENDING') throw businessRule('Complete the work before submitting the inspection report', 'ILLEGAL_JOB_TRANSITION');
    await assertOwnUnattachedFiles(tx, auth, input.attachmentIds, ['INSPECTION_EVIDENCE', 'JOB_PHOTO']);
    if (input.documentId) await assertOwnUnattachedFiles(tx, auth, [input.documentId], ['COMPLIANCE_DOCUMENT']);
    const reportId = await new PostgresInspectionRepository(tx).insert(jobId, auth.employeeId!, input);
    await new PostgresFileRepository(tx).markAttached([...input.attachmentIds, ...(input.documentId ? [input.documentId] : [])]);
    const passed = input.complianceStatus !== 'FAIL';
    if (passed) {
      await transitionJob(tx, events, job, 'INSPECTION_PASSED', actor, { note: `Certificate ${input.certificateNumber}` });
      await events.notify([job.customerUserId], {
        type: 'JOB_COMPLETED',
        title: `${job.reference} completed & certified`,
        body: `Certificate of Compliance ${input.certificateNumber} is now available in the app.`,
        data: { jobId, reportId },
      });
    } else {
      await transitionJob(tx, events, job, 'INSPECTION_FAILED', actor, { note: 'Inspection failed — remedial work required' });
      await new PostgresJobRepository(tx).clearCompletedAt(jobId);
      await events.notify([job.customerUserId], {
        type: 'INSPECTION_SUBMITTED',
        title: `${job.reference}: remedial work required`,
        body: 'The safety inspection found items that must be corrected before certification.',
        data: { jobId, reportId },
      });
    }
    await events.notifyAdmins({
      type: 'INSPECTION_SUBMITTED',
      title: `Inspection ${input.complianceStatus} · ${job.reference}`,
      body: passed ? `CoC ${input.certificateNumber} — ready to invoice` : 'Remedial work required',
      data: { jobId, reportId },
    });
    await audit(tx, actor, 'INSPECTION_SUBMITTED', 'inspection_report', reportId, { jobId, status: input.complianceStatus, certificate: input.certificateNumber });
  });
  return getJobDetail(auth, jobId);
}

export async function listInspectionReports(auth: AuthContext, page: number, pageSize: number) {
  const repo = new PostgresInspectionRepository(db());
  const scope =
    auth.role === 'CUSTOMER' ? { customerId: auth.customerId ?? undefined } : auth.role === 'EMPLOYEE' ? { employeeId: auth.employeeId ?? undefined } : {};
  const { items, total } = await repo.list({ ...scope, limit: pageSize, offset: (page - 1) * pageSize });
  return paginated(await Promise.all(items.map((r) => toInspectionDto(db(), r))), page, pageSize, total);
}

export async function getInspectionReport(auth: AuthContext, id: string) {
  const row = await new PostgresInspectionRepository(db()).findById(id);
  if (!row) throw notFound('Inspection report');
  const job = await loadJob(db(), row.jobId);
  const allowed =
    isAdminRole(auth) ||
    (auth.role === 'CUSTOMER' && row.customerId === auth.customerId) ||
    (auth.role === 'EMPLOYEE' && (row.employeeId === auth.employeeId || (job && canAccessJob(auth, job))));
  if (!allowed) throw notFound('Inspection report');
  return toInspectionDto(db(), row);
}

export async function jobKpis(): Promise<Pick<AdminDashboardDto['kpis'], 'activeJobs' | 'requestedJobs' | 'quotesAwaiting'>> {
  const { rows } = await db().query<{ active: number; requested: number; quotes: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('SCHEDULED','IN_PROGRESS','INSPECTION_PENDING'))::int AS active,
            count(*) FILTER (WHERE status = 'REQUESTED')::int AS requested,
            count(*) FILTER (WHERE status = 'QUOTED')::int AS quotes
       FROM jobs`,
  );
  const r = rows[0]!;
  return { activeJobs: r.active, requestedJobs: r.requested, quotesAwaiting: r.quotes };
}

export { JOB_STATUS_LABELS };
