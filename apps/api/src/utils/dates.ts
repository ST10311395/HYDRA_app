/** Date helpers operating in the business timezone (Africa/Johannesburg, UTC+2, no DST). */
export const BUSINESS_TZ_OFFSET_MINUTES = 120;

export function todayIso(now = new Date()): string {
  return toBusinessDate(now);
}

export function toBusinessDate(d: Date): string {
  const shifted = new Date(d.getTime() + BUSINESS_TZ_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Start of a business day as a UTC instant. */
export function businessDayStart(isoDate: string): Date {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - BUSINESS_TZ_OFFSET_MINUTES * 60_000);
}

export function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
