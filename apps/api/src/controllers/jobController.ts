/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { Router } from 'express';
import { z } from 'zod';
import {
  QUOTE_STATUSES,
  addMilestoneSchema,
  adminConfirmArrivalSchema,
  adminCreateJobSchema,
  assignJobSchema,
  cancelJobSchema,
  checkinSchema,
  completeJobSchema,
  completeMilestoneSchema,
  createJobSchema,
  createQuoteSchema,
  declineQuoteSchema,
  generateInvoiceSchema,
  idParam,
  isoDateTime,
  jobListQuery,
  jobNoteSchema,
  logMaterialsSchema,
  paginationQuery,
  reportDelaySchema,
  submitInspectionSchema,
  uuid,
} from '@hydra/shared';
import { actorFrom, auth } from '../middleware/auth';
import { defineRoute } from '../routes/define';
import { generateInvoice } from '../services/billingService';
import * as dispatch from '../services/dispatchService';
import * as inventory from '../services/inventoryService';
import * as jobs from '../services/jobService';
import * as quotes from '../services/quoteService';

const ADMIN = ['ADMIN_OFFICE', 'ADMIN_OWNER'] as const;
const STAFF = ['EMPLOYEE', 'ADMIN_OFFICE', 'ADMIN_OWNER'] as const;

export function registerJobRoutes(r: Router): void {
  defineRoute(r, { method: 'get', path: '/jobs', tag: 'Jobs', summary: 'List jobs (scoped: customer → own, electrician → assigned, admin → all)', access: 'authenticated', query: jobListQuery },
    (req, { query }) => jobs.listJobs(auth(req), query));

  defineRoute(r, { method: 'post', path: '/jobs', tag: 'Jobs', summary: 'Request a service (creates a REQUESTED job)', access: ['CUSTOMER'], body: createJobSchema, status: 201, idempotent: true },
    (req, { body }) => jobs.createJob(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/admin', tag: 'Jobs', summary: 'Admin logs a job on behalf of a customer', access: ADMIN, body: adminCreateJobSchema, status: 201, idempotent: true },
    (req, { body }) => jobs.adminCreateJob(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/jobs/:id', tag: 'Jobs', summary: 'Job detail with milestones, check-ins, materials, inspection, quote and invoice', access: 'authenticated', params: idParam },
    (req, { params }) => jobs.getJobDetail(auth(req), params.id));

  defineRoute(r, { method: 'post', path: '/jobs/:id/cancel', tag: 'Jobs', summary: 'Cancel a job (lifecycle-guarded)', access: ['CUSTOMER', ...ADMIN], params: idParam, body: cancelJobSchema },
    (req, { params, body }) => jobs.cancelJob(auth(req), params.id, body.reason, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/notes', tag: 'Jobs', summary: 'Add a job note', access: 'authenticated', params: idParam, body: jobNoteSchema, status: 201 },
    (req, { params, body }) => jobs.addNote(auth(req), params.id, body.body, body.visibility, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/attachments', tag: 'Jobs', summary: 'Attach uploaded photos to a job', access: 'authenticated', params: idParam, body: z.object({ fileIds: z.array(uuid).min(1).max(10) }), status: 201 },
    (req, { params, body }) => jobs.addAttachments(auth(req), params.id, body.fileIds, actorFrom(req)));

  // Quotes
  defineRoute(r, { method: 'post', path: '/jobs/:id/quote', tag: 'Quotes', summary: 'Create (and optionally send) a quote', access: ADMIN, params: idParam, body: createQuoteSchema, status: 201 },
    (req, { params, body }) => quotes.createQuote(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/quotes', tag: 'Quotes', summary: 'List quotes', access: ['CUSTOMER', ...ADMIN], query: paginationQuery.extend({ status: z.enum(QUOTE_STATUSES).optional() }) },
    (req, { query }) => quotes.listQuotes(auth(req), query.page, query.pageSize, query.status));

  defineRoute(r, { method: 'get', path: '/quotes/:id', tag: 'Quotes', summary: 'Quote detail', access: ['CUSTOMER', ...ADMIN], params: idParam },
    (req, { params }) => quotes.getQuote(auth(req), params.id));

  defineRoute(r, { method: 'post', path: '/quotes/:id/send', tag: 'Quotes', summary: 'Send a draft quote', access: ADMIN, params: idParam },
    (req, { params }) => quotes.sendQuote(auth(req), params.id, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/quotes/:id/accept', tag: 'Quotes', summary: 'Accept a quote (transactional)', access: ['CUSTOMER'], params: idParam },
    (req, { params }) => quotes.respondToQuote(auth(req), params.id, 'ACCEPT', undefined, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/quotes/:id/decline', tag: 'Quotes', summary: 'Decline a quote with optional reason', access: ['CUSTOMER'], params: idParam, body: declineQuoteSchema },
    (req, { params, body }) => quotes.respondToQuote(auth(req), params.id, 'DECLINE', body.reason, actorFrom(req)));

  // Dispatch
  defineRoute(r, { method: 'get', path: '/jobs/availability/electricians', tag: 'Dispatch', summary: 'Electrician availability and conflicts for a time window', access: ADMIN,
    query: z.object({ start: isoDateTime, end: isoDateTime, jobId: uuid.optional() }) },
    (_req, { query }) => dispatch.availability(query.start, query.end, query.jobId));

  defineRoute(r, { method: 'post', path: '/jobs/:id/assign', tag: 'Dispatch', summary: 'Assign or reassign an electrician (after quote acceptance)', access: ADMIN, params: idParam, body: assignJobSchema },
    (req, { params, body }) => dispatch.assignJob(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/jobs/:id/qr', tag: 'Dispatch', summary: 'Customer: issue a short-lived arrival QR code', access: ['CUSTOMER'], params: idParam },
    (req, { params }) => dispatch.issueQr(auth(req), params.id));

  defineRoute(r, { method: 'post', path: '/jobs/:id/checkin', tag: 'Dispatch', summary: 'Electrician: QR + GPS arrival check-in', access: ['EMPLOYEE'], params: idParam, body: checkinSchema },
    (req, { params, body }) => dispatch.checkIn(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/confirm-arrival', tag: 'Dispatch', summary: 'Admin: confirm arrival when QR scanning fails (audited)', access: ADMIN, params: idParam, body: adminConfirmArrivalSchema },
    (req, { params, body }) => dispatch.adminConfirmArrival(auth(req), params.id, body.reason, body.location, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/delay', tag: 'Dispatch', summary: 'Electrician: report a delay en route', access: ['EMPLOYEE'], params: idParam, body: reportDelaySchema },
    (req, { params, body }) => dispatch.reportDelay(auth(req), params.id, body.minutes, body.note, actorFrom(req)));

  // Field work
  defineRoute(r, { method: 'post', path: '/jobs/:id/milestones', tag: 'Field work', summary: 'Add an on-site milestone', access: STAFF, params: idParam, body: addMilestoneSchema, status: 201 },
    (req, { params, body }) => jobs.addMilestone(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/milestones/:milestoneId/complete', tag: 'Field work', summary: 'Complete a milestone', access: STAFF,
    params: z.object({ id: uuid, milestoneId: uuid }), body: completeMilestoneSchema },
    (req, { params, body }) => jobs.completeMilestone(auth(req), params.id, params.milestoneId, body.note, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/materials', tag: 'Field work', summary: 'Log materials used (atomic stock decrement)', access: STAFF, params: idParam, body: logMaterialsSchema, status: 201, idempotent: true },
    (req, { params, body }) => inventory.logMaterials(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'delete', path: '/jobs/:id/materials/:jobMaterialId', tag: 'Field work', summary: 'Reverse a material entry (stock returned)', access: STAFF,
    params: z.object({ id: uuid, jobMaterialId: uuid }) },
    (req, { params }) => inventory.removeJobMaterial(auth(req), params.id, params.jobMaterialId, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/complete', tag: 'Field work', summary: 'Electrician: mark on-site work complete (→ inspection pending)', access: ['EMPLOYEE'], params: idParam, body: completeJobSchema },
    (req, { params, body }) => jobs.completeWork(auth(req), params.id, body.summary, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/jobs/:id/inspection', tag: 'Compliance', summary: 'Submit inspection / compliance report (PASS → job completed)', access: ['EMPLOYEE'], params: idParam, body: submitInspectionSchema, status: 201 },
    (req, { params, body }) => jobs.submitInspection(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/inspection-reports', tag: 'Compliance', summary: 'Inspection / CoC reports (scoped)', access: 'authenticated', query: paginationQuery },
    (req, { query }) => jobs.listInspectionReports(auth(req), query.page, query.pageSize));

  defineRoute(r, { method: 'get', path: '/inspection-reports/:id', tag: 'Compliance', summary: 'Inspection report detail', access: 'authenticated', params: idParam },
    (req, { params }) => jobs.getInspectionReport(auth(req), params.id));

  defineRoute(r, { method: 'post', path: '/jobs/:id/invoice', tag: 'Billing', summary: 'Generate an invoice from a completed job', access: ADMIN, params: idParam, body: generateInvoiceSchema, status: 201 },
    (req, { params, body }) => generateInvoice(auth(req), params.id, body, actorFrom(req)));
}
