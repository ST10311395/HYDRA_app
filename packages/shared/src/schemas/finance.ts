/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import { z } from 'zod';
import { DISCOUNT_TYPES, INVOICE_STATUSES, PAYMENT_METHODS } from '../enums.js';
import { isoDate, money, optionalText, paginationQuery, trimmed, uuid } from './common.js';

export const generateInvoiceSchema = z.object({
  dueDate: isoDate,
  /** Include actual logged material cost variance vs quoted materials (business setting may force). */
  includeMaterialVariance: z.boolean().default(false),
  notes: optionalText(1000),
  send: z.boolean().default(true),
});
export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;

export const invoiceListQuery = paginationQuery.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  customerId: uuid.optional(),
});

export const createPaymentSchema = z.object({
  /** Amount to pay now; omit for the full outstanding balance. Partial payments are supported. */
  amount: money.refine((v) => v >= 1, { message: 'Minimum payment is R1.00' }).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Admin recording an offline payment (EFT/cash) — audited. */
export const recordManualPaymentSchema = z.object({
  amount: money.refine((v) => v > 0, { message: 'Amount must be greater than 0' }),
  method: z.enum(PAYMENT_METHODS),
  reference: trimmed(80, 3),
  paidOn: isoDate,
});

export const materialSchema = z.object({
  sku: trimmed(40, 2),
  name: trimmed(120, 2),
  unit: trimmed(20, 1),
  unitCost: money,
  stockLevel: z.number().min(0).max(1_000_000),
  reorderLevel: z.number().min(0).max(1_000_000),
  supplierName: optionalText(120),
  supplierContact: optionalText(120),
});
export type MaterialInput = z.infer<typeof materialSchema>;
export const updateMaterialSchema = materialSchema.omit({ stockLevel: true }).partial();

export const stockAdjustmentSchema = z.object({
  delta: z.number().finite().refine((v) => v !== 0, { message: 'Adjustment cannot be zero' }),
  reason: z.enum(['RESTOCK', 'ADJUSTMENT']),
  note: trimmed(300, 3),
});

export const materialListQuery = paginationQuery.extend({
  lowStockOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,24}$/, { message: '3–24 letters, numbers or dashes' }),
    description: trimmed(300, 3),
    discountType: z.enum(DISCOUNT_TYPES),
    value: z.number().positive().max(1_000_000),
    pointsCost: z.number().int().min(0).max(1_000_000),
    minSpend: money.default(0),
    validFrom: isoDate,
    validUntil: isoDate,
    active: z.boolean().default(true),
    maxRedemptions: z.number().int().min(1).max(1_000_000).optional(),
  })
  .refine((d) => d.validFrom <= d.validUntil, { message: 'Must end after it starts', path: ['validUntil'] })
  .refine((d) => d.discountType !== 'PERCENT' || d.value <= 100, {
    message: 'Percentage cannot exceed 100',
    path: ['value'],
  });
export type DiscountInput = z.infer<typeof discountSchema>;

export const redeemDiscountSchema = z.object({ invoiceId: uuid });

export const exportRequestSchema = z
  .object({
    type: z.enum([
      'CUSTOMERS',
      'EMPLOYEES',
      'JOBS',
      'INVOICES',
      'PAYMENTS',
      'TIMESHEETS',
      'PAYROLL',
      'INVENTORY',
      'ENQUIRIES',
    ]),
    format: z.enum(['CSV', 'PDF']).default('CSV'),
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.from <= v.to, { message: '`from` must be on or before `to`', path: ['to'] });
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
