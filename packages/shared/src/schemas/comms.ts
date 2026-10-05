import { z } from 'zod';
import { CONTACT_QUERY_SOURCES, CONTACT_QUERY_STATUSES, JOB_URGENCIES, MESSAGE_CHANNELS } from '../enums.js';
import { email, isoDateTime, optionalText, paginationQuery, phone, trimmed, uuid } from './common.js';

/** Public contact / dispatch form (PDF Story 24). Only minimal fields are collected (POPIA). */
export const contactQuerySchema = z.object({
  name: trimmed(120, 2),
  email,
  phone,
  sector: optionalText(120),
  urgency: z.enum(JOB_URGENCIES).default('STANDARD'),
  message: trimmed(3000, 10),
  source: z.enum(CONTACT_QUERY_SOURCES).default('CONTACT_FORM'),
  /** Structured data from the multi-step quotation wizard (sector, voltage, scope, location). */
  details: z
    .object({
      sector: optionalText(80),
      voltageLevel: optionalText(80),
      scope: optionalText(2000),
      siteAddress: optionalText(300),
      estimatedLoadKva: z.number().min(0).max(100_000).optional(),
      preferredContact: z.enum(['PHONE', 'EMAIL', 'WHATSAPP']).optional(),
      requestedSpecialist: optionalText(120),
    })
    .optional(),
  consent: z.literal(true, { message: 'Consent is required so we can respond to your enquiry' }),
  /** Honeypot: must be empty. Bots that fill every field are rejected. */
  website: z.string().max(0).optional(),
});
export type ContactQueryInput = z.infer<typeof contactQuerySchema>;

export const contactQueryListQuery = paginationQuery.extend({
  status: z.enum(CONTACT_QUERY_STATUSES).optional(),
});

export const updateContactQuerySchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'CLOSED']).optional(),
  adminNotes: optionalText(2000),
  assignToMe: z.boolean().optional(),
});

export const convertContactQuerySchema = z.object({
  serviceTypeId: uuid,
  siteAddress: trimmed(300, 5),
  description: optionalText(2000),
  /** When no customer account matches the enquiry's email, one is provisioned (invite-by-reset link). */
  createCustomerIfMissing: z.boolean().default(true),
});

export const missedCallSchema = z.object({
  phoneNumber: phone,
  callAt: isoDateTime,
  durationSeconds: z.number().int().min(0).max(86_400).default(0),
  deviceId: optionalText(80),
  source: z.enum(['DEVICE_MONITOR', 'MANUAL']).default('MANUAL'),
});
export type MissedCallInput = z.infer<typeof missedCallSchema>;

export const missedCallListQuery = paginationQuery.extend({
  status: z.enum(['NEW', 'AUTO_REPLIED', 'REVIEW_REQUIRED', 'REPLIED', 'DISMISSED', 'FAILED']).optional(),
});

export const sendMissedCallReplySchema = z.object({
  message: trimmed(480, 5),
  channel: z.enum(MESSAGE_CHANNELS).default('SMS'),
});

export const dismissMissedCallSchema = z.object({ reason: optionalText(300) });

export const notificationListQuery = paginationQuery.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const settingsUpdateSchema = z.object({
  missedCallAutomationEnabled: z.boolean().optional(),
  missedCallAutoReplyTemplate: optionalText(480),
  missedCallDefaultChannel: z.enum(MESSAGE_CHANNELS).optional(),
  rewardsRandPerPoint: z.number().min(1).max(1000).optional(),
  vatRate: z.number().min(0).max(0.3).optional(),
  payrollRequirePaidInvoice: z.boolean().optional(),
  invoiceIncludeMaterialVariance: z.boolean().optional(),
  lowStockAlertsEnabled: z.boolean().optional(),
});
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

export const auditListQuery = paginationQuery.extend({
  action: optionalText(80),
  entityType: optionalText(60),
  actorUserId: uuid.optional(),
});
