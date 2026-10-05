/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import { z } from 'zod';
import {
  COMPLIANCE_STATUSES,
  JOB_STATUSES,
  JOB_URGENCIES,
  QUOTE_ITEM_KINDS,
} from '../enums.js';
import {
  gpsPoint,
  isoDate,
  isoDateTime,
  money,
  optionalText,
  paginationQuery,
  positiveQuantity,
  trimmed,
  uuid,
} from './common.js';

export const createJobSchema = z.object({
  serviceTypeId: uuid,
  siteAddress: trimmed(300, 5),
  siteLocation: gpsPoint.optional(),
  description: trimmed(2000, 10),
  urgency: z.enum(JOB_URGENCIES).default('STANDARD'),
  preferredDate: isoDate.optional(),
  preferredTimeWindow: z.enum(['MORNING', 'AFTERNOON', 'ANY']).default('ANY'),
  contactPhone: z.string().trim().max(24).optional(),
  contactConfirmed: z.literal(true, { message: 'Please confirm your contact details' }),
  attachmentIds: z.array(uuid).max(6).default([]),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Admin creating a job on behalf of a customer (e.g. phone booking). */
export const adminCreateJobSchema = createJobSchema
  .omit({ contactConfirmed: true })
  .extend({ customerId: uuid });

export const jobListQuery = paginationQuery.extend({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(JOB_STATUSES)).optional()),
  serviceTypeId: uuid.optional(),
  employeeId: uuid.optional(),
  customerId: uuid.optional(),
  urgency: z.enum(JOB_URGENCIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['newest', 'oldest', 'scheduled']).default('newest'),
});
export type JobListQuery = z.infer<typeof jobListQuery>;

export const quoteItemSchema = z.object({
  kind: z.enum(QUOTE_ITEM_KINDS),
  description: trimmed(200, 1),
  quantity: positiveQuantity,
  unitPrice: money,
});
export type QuoteItemInput = z.infer<typeof quoteItemSchema>;

export const createQuoteSchema = z
  .object({
    items: z.array(quoteItemSchema).min(1, { message: 'Add at least one line item' }).max(50),
    discountAmount: money.default(0),
    validUntil: isoDate,
    terms: optionalText(2000),
    notes: optionalText(2000),
    send: z.boolean().default(true),
  })
  .refine((q) => q.items.some((i) => i.kind === 'LABOUR'), {
    message: 'A labour line is required',
    path: ['items'],
  });
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const declineQuoteSchema = z.object({ reason: optionalText(500) });

export const assignJobSchema = z
  .object({
    employeeId: uuid,
    scheduledStart: isoDateTime,
    scheduledEnd: isoDateTime,
    notes: optionalText(500),
    /** Admin must explicitly acknowledge a detected schedule conflict to proceed. */
    overrideConflicts: z.boolean().default(false),
  })
  .refine((v) => Date.parse(v.scheduledEnd) > Date.parse(v.scheduledStart), {
    message: 'End must be after start',
    path: ['scheduledEnd'],
  });
export type AssignJobInput = z.infer<typeof assignJobSchema>;

export const checkinSchema = z.object({
  qrToken: z.string().min(16).max(256),
  location: gpsPoint,
});
export type CheckinInput = z.infer<typeof checkinSchema>;

export const adminConfirmArrivalSchema = z.object({
  reason: trimmed(500, 5),
  location: gpsPoint.optional(),
});

export const addMilestoneSchema = z.object({
  name: trimmed(80, 2),
  description: optionalText(300),
  plannedDate: isoDate.optional(),
});

export const completeMilestoneSchema = z.object({ note: optionalText(500) });

export const jobNoteSchema = z.object({
  body: trimmed(2000, 1),
  visibility: z.enum(['INTERNAL', 'CUSTOMER']).default('INTERNAL'),
});

export const logMaterialsSchema = z.object({
  items: z
    .array(
      z.object({
        materialId: uuid,
        quantity: positiveQuantity,
        notes: optionalText(300),
      }),
    )
    .min(1)
    .max(30),
  /** Owner-only: allow stock to go below zero (audited). */
  overrideStock: z.boolean().default(false),
});
export type LogMaterialsInput = z.infer<typeof logMaterialsSchema>;

export const inspectionChecklistItem = z.object({
  key: trimmed(60, 1),
  label: trimmed(120, 1),
  result: z.enum(['PASS', 'FAIL', 'NA']),
  reading: optionalText(60),
});

export const submitInspectionSchema = z
  .object({
    complianceStatus: z.enum(COMPLIANCE_STATUSES),
    certificateNumber: optionalText(60),
    findings: trimmed(4000, 5),
    notes: optionalText(2000),
    checklist: z.array(inspectionChecklistItem).min(1).max(40),
    signatureName: trimmed(120, 2),
    confirmed: z.literal(true, { message: 'Confirm the declaration to submit' }),
    attachmentIds: z.array(uuid).max(10).default([]),
    documentId: uuid.optional(),
  })
  .refine((v) => v.complianceStatus === 'FAIL' || !!v.certificateNumber, {
    message: 'A certificate number is required for a passing or conditional inspection',
    path: ['certificateNumber'],
  })
  .refine((v) => v.complianceStatus !== 'PASS' || v.checklist.every((c) => c.result !== 'FAIL'), {
    message: 'A PASS report cannot contain failed checklist items',
    path: ['checklist'],
  });
export type SubmitInspectionInput = z.infer<typeof submitInspectionSchema>;

export const completeJobSchema = z.object({ summary: optionalText(1000) });

export const cancelJobSchema = z.object({ reason: trimmed(500, 3) });

export const reportDelaySchema = z.object({ minutes: z.number().int().min(5).max(600), note: optionalText(300) });

export const serviceTypeSchema = z.object({
  name: trimmed(120, 2),
  category: z.enum(['SOLAR', 'CABLING', 'SUBSTATIONS', 'EMERGENCY', 'COMPLIANCE', 'AUTOMATION']),
  description: trimmed(1000, 5),
  basePrice: money,
  slaText: optionalText(80),
  badge: optionalText(40),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(1000).default(0),
});
export type ServiceTypeInput = z.infer<typeof serviceTypeSchema>;
