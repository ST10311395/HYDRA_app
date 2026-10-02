import type { Router } from 'express';
import { z } from 'zod';
import {
  auditListQuery,
  contactQueryListQuery,
  contactQuerySchema,
  convertContactQuerySchema,
  dismissMissedCallSchema,
  exportRequestSchema,
  idParam,
  isoDate,
  missedCallListQuery,
  missedCallSchema,
  notificationListQuery,
  paginationQuery,
  sendMissedCallReplySchema,
  settingsUpdateSchema,
  trimmed,
  updateContactQuerySchema,
  type SettingsDto,
} from '@hydra/shared';
import { config } from '../config/env';
import { db } from '../db/pool';
import { integrations } from '../integrations';
import { actorFrom, auth } from '../middleware/auth';
import { contactLimiter } from '../middleware/rateLimits';
import { PostgresNotificationRepository } from '../repositories/notificationRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import { defineRoute } from '../routes/define';
import { audit } from '../services/auditService';
import * as dashboards from '../services/dashboardService';
import * as enquiries from '../services/enquiryService';
import * as missedCalls from '../services/missedCallService';
import * as privacy from '../services/privacyService';
import * as reports from '../services/reportService';
import { addDays, todayIso } from '../utils/dates';
import { notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';

const ADMIN = ['ADMIN_OFFICE', 'ADMIN_OWNER'] as const;
const OWNER = ['ADMIN_OWNER'] as const;

async function settingsDto(): Promise<SettingsDto> {
  const cfg = config();
  const s = await new PostgresSettingsRepository(db()).getAll();
  const i = integrations();
  return {
    ...s,
    integrations: {
      googleSignIn: i.google.configured,
      payments: i.payments.name,
      storage: i.storage.name,
      sms: i.messaging.SMS.configured,
      whatsapp: i.messaging.WHATSAPP.configured,
      push: cfg.PUSH_NOTIFICATION_CONFIG === 'expo',
      email: i.email.name,
    },
  };
}

export function registerAdminRoutes(r: Router): void {
  // ---- Dashboards ----------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/dashboard/customer', tag: 'Dashboards', summary: 'Customer dashboard', access: ['CUSTOMER'] },
    (req) => dashboards.customerDashboard(auth(req)));
  defineRoute(r, { method: 'get', path: '/dashboard/employee', tag: 'Dashboards', summary: 'Electrician “Today” view', access: ['EMPLOYEE'] },
    (req) => dashboards.employeeToday(auth(req)));
  defineRoute(r, { method: 'get', path: '/dashboard/admin', tag: 'Dashboards', summary: 'Operations centre KPIs and activity', access: ADMIN },
    (req) => dashboards.adminDashboard(auth(req)));

  // ---- Enquiries -----------------------------------------------------------------------------
  defineRoute(r, { method: 'post', path: '/contact-queries', tag: 'Enquiries', summary: 'Submit a public contact / quotation enquiry (no login)', access: 'optional', body: contactQuerySchema, status: 201, pre: [contactLimiter] },
    (req, { body }) => enquiries.submitEnquiry(body, req.auth, actorFrom(req)));
  defineRoute(r, { method: 'get', path: '/contact-queries', tag: 'Enquiries', summary: 'Enquiry inbox', access: ADMIN, query: contactQueryListQuery },
    (_req, { query }) => enquiries.listEnquiries(query));
  defineRoute(r, { method: 'get', path: '/contact-queries/:id', tag: 'Enquiries', summary: 'Enquiry detail', access: ADMIN, params: idParam },
    (_req, { params }) => enquiries.getEnquiry(params.id));
  defineRoute(r, { method: 'patch', path: '/contact-queries/:id', tag: 'Enquiries', summary: 'Triage an enquiry', access: ADMIN, params: idParam, body: updateContactQuerySchema },
    (req, { params, body }) => enquiries.updateEnquiry(auth(req), params.id, body, actorFrom(req)));
  defineRoute(r, { method: 'post', path: '/contact-queries/:id/convert', tag: 'Enquiries', summary: 'Convert enquiry to customer + job (traceable)', access: ADMIN, params: idParam, body: convertContactQuerySchema, status: 201, idempotent: true },
    (req, { params, body }) => enquiries.convertEnquiry(auth(req), params.id, body, actorFrom(req)));

  // ---- Missed calls & automated messages -------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/missed-calls/status', tag: 'Missed calls', summary: 'Feature flag, consent and provider status for this device/admin', access: ADMIN },
    (req) => missedCalls.monitoringStatus(auth(req)));
  defineRoute(r, { method: 'post', path: '/missed-calls/consent', tag: 'Missed calls', summary: 'Grant or withdraw call-log monitoring consent (POPIA)', access: ADMIN, body: z.object({ granted: z.boolean() }) },
    (req, { body }) => missedCalls.setMonitoringConsent(auth(req), body.granted, actorFrom(req)));
  defineRoute(r, { method: 'post', path: '/missed-calls', tag: 'Missed calls', summary: 'Log a missed call (device monitor or manual) and run the auto-response workflow', access: ADMIN, body: missedCallSchema, status: 201 },
    (req, { body }) => missedCalls.logMissedCall(auth(req), body, actorFrom(req)));
  defineRoute(r, { method: 'get', path: '/missed-calls', tag: 'Missed calls', summary: 'Missed call log', access: ADMIN, query: missedCallListQuery },
    (_req, { query }) => missedCalls.listMissedCalls(query));
  defineRoute(r, { method: 'get', path: '/missed-calls/:id', tag: 'Missed calls', summary: 'Missed call detail', access: ADMIN, params: idParam },
    (_req, { params }) => missedCalls.getMissedCall(params.id));
  defineRoute(r, { method: 'post', path: '/missed-calls/:id/reply', tag: 'Missed calls', summary: 'Approve/send a reply (human-in-the-loop)', access: ADMIN, params: idParam, body: sendMissedCallReplySchema },
    (req, { params, body }) => missedCalls.replyToMissedCall(auth(req), params.id, body.message, body.channel, actorFrom(req)));
  defineRoute(r, { method: 'post', path: '/missed-calls/:id/dismiss', tag: 'Missed calls', summary: 'Dismiss without replying', access: ADMIN, params: idParam, body: dismissMissedCallSchema },
    (req, { params, body }) => missedCalls.dismissMissedCall(params.id, body.reason, actorFrom(req)));
  defineRoute(r, { method: 'get', path: '/message-logs', tag: 'Missed calls', summary: 'Outgoing automated message log (AI_MESSAGE_LOG)', access: ADMIN, query: paginationQuery },
    (_req, { query }) => missedCalls.listMessageLogs(query));

  // ---- Notifications -------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'My notifications', access: 'authenticated', query: notificationListQuery },
    async (req, { query }) => {
      const res = await new PostgresNotificationRepository(db()).list(auth(req).userId, query.unreadOnly, query.pageSize, (query.page - 1) * query.pageSize);
      return { ...paginated(res.items, query.page, query.pageSize, res.total), unread: res.unread };
    });
  defineRoute(r, { method: 'post', path: '/notifications/:id/read', tag: 'Notifications', summary: 'Mark as read', access: 'authenticated', params: idParam },
    async (req, { params }) => {
      if (!(await new PostgresNotificationRepository(db()).markRead(auth(req).userId, params.id))) throw notFound('Notification');
      return { read: true };
    });
  defineRoute(r, { method: 'post', path: '/notifications/read-all', tag: 'Notifications', summary: 'Mark all as read', access: 'authenticated' },
    async (req) => ({ updated: await new PostgresNotificationRepository(db()).markAllRead(auth(req).userId) }));

  // ---- Settings ------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/settings', tag: 'Settings', summary: 'Business settings and integration status', access: ADMIN },
    () => settingsDto());
  defineRoute(r, { method: 'patch', path: '/settings', tag: 'Settings', summary: 'Update privileged configuration (owner)', access: OWNER, body: settingsUpdateSchema },
    async (req, { body }) => {
      await new PostgresSettingsRepository(db()).update(body, auth(req).userId);
      await audit(db(), actorFrom(req), 'SETTINGS_UPDATED', 'app_settings', null, body as Record<string, unknown>);
      return settingsDto();
    });

  // ---- Reports, exports, audit (owner / manager) -------------------------------------------------
  defineRoute(r, { method: 'get', path: '/reports/summary', tag: 'Reports', summary: 'Business summary for a date range', access: OWNER,
    query: z.object({ from: isoDate.optional(), to: isoDate.optional() }) },
    (_req, { query }) => reports.reportSummary(query.from ?? addDays(todayIso(), -30), query.to ?? todayIso()));

  defineRoute(r, { method: 'post', path: '/exports', tag: 'Reports', summary: 'Export a data category as CSV/PDF (owner-only, audited)', access: OWNER, body: exportRequestSchema, raw: true },
    async (req, { body }, res) => {
      const file = await reports.exportData(body, actorFrom(req));
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('X-Row-Count', String(file.rowCount));
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(file.body);
    });
  defineRoute(r, { method: 'get', path: '/exports', tag: 'Reports', summary: 'Export history (DATA_EXPORT_LOG)', access: OWNER, query: paginationQuery },
    (_req, { query }) => reports.listExports(query.page, query.pageSize));
  defineRoute(r, { method: 'get', path: '/audit-logs', tag: 'Reports', summary: 'Append-only audit trail', access: OWNER, query: auditListQuery },
    (_req, { query }) => reports.listAuditLogs(query));

  defineRoute(r, { method: 'get', path: '/data-requests', tag: 'Reports', summary: 'POPIA data-subject requests', access: OWNER, query: paginationQuery },
    (_req, { query }) => privacy.listDataRequests(query.page, query.pageSize));
  defineRoute(r, { method: 'post', path: '/data-requests/:id/resolve', tag: 'Reports', summary: 'Resolve a data-subject request (deletion = anonymisation)', access: OWNER, params: idParam,
    body: z.object({ status: z.enum(['COMPLETED', 'REJECTED']), resolution: trimmed(1000, 3) }) },
    (req, { params, body }) => privacy.resolveDataRequest(auth(req), params.id, body.status, body.resolution, actorFrom(req)));

}
