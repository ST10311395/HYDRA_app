import { z } from 'zod';

export const uuid = z.uuid({ message: 'Invalid identifier' });

export const trimmed = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? { message: min === 1 ? 'Required' : `Must be at least ${min} characters` } : undefined)
    .max(max, { message: `Must be at most ${max} characters` });

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: `Must be at most ${max} characters` })
    .transform((v) => (v === '' ? undefined : v))
    .optional();

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));

/** South African or international phone numbers: +27 82 000 0000, 082 000 0000, (011) 987-6500. */
export const phone = z
  .string()
  .trim()
  .max(24)
  .regex(/^\+?[0-9 ()-]{9,20}$/, { message: 'Enter a valid phone number' })
  .refine((v) => v.replace(/\D/g, '').length >= 9, { message: 'Enter a valid phone number' });

/** NIST 800-63B aligned: length over complexity, minimum 12 characters (PDF §6.1.2). */
export const password = z
  .string()
  .min(12, { message: 'Password must be at least 12 characters' })
  .max(128, { message: 'Password must be at most 128 characters' });

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use YYYY-MM-DD' })
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { message: 'Invalid date' });

export const isoDateTime = z.iso.datetime({ offset: true, message: 'Invalid date/time' });

export const money = z
  .number({ message: 'Enter an amount' })
  .finite()
  .min(0, { message: 'Must be zero or more' })
  .max(100_000_000, { message: 'Amount too large' })
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'At most 2 decimal places',
  });

export const positiveQuantity = z.number().finite().gt(0, { message: 'Must be greater than 0' }).max(1_000_000);

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

export const gpsPoint = z.object({
  latitude,
  longitude,
  accuracy: z.number().min(0).max(100_000).optional(),
});
export type GpsPoint = z.infer<typeof gpsPoint>;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalText(100),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const dateRangeQuery = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: '`from` must be on or before `to`', path: ['to'] });

export const idParam = z.object({ id: uuid });

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Standard structured error body returned by every API error. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: { path: string; message: string }[];
  };
}
