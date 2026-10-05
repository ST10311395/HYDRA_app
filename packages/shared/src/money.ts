/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Money helpers. All arithmetic is done in integer cents to avoid floating-point drift;
 * values cross the API boundary as numbers rounded to 2 decimals (NUMERIC(12,2) in PostgreSQL).
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export function sumMoney(values: readonly number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

export function formatZar(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(roundMoney(amount));
  const [whole = '0', frac = '00'] = abs.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}R ${grouped}.${frac}`;
}

export interface QuoteLineInput {
  kind: 'LABOUR' | 'MATERIAL' | 'FEE';
  quantity: number;
  unitPrice: number;
}

export interface QuoteTotals {
  labourCost: number;
  materialsCost: number;
  fees: number;
  discountAmount: number;
  subtotal: number;
  vatAmount: number;
  total: number;
}

/** Quote totals: subtotal = labour + materials + fees − discount; VAT applied on the subtotal. */
export function calculateQuoteTotals(
  items: readonly QuoteLineInput[],
  discountAmount: number,
  vatRate: number,
): QuoteTotals {
  let labour = 0;
  let materials = 0;
  let fees = 0;
  for (const item of items) {
    const line = Math.round(item.quantity * toCents(item.unitPrice));
    if (item.kind === 'LABOUR') labour += line;
    else if (item.kind === 'MATERIAL') materials += line;
    else fees += line;
  }
  const gross = labour + materials + fees;
  const discount = Math.min(toCents(discountAmount), gross);
  const subtotal = gross - discount;
  const vat = Math.round(subtotal * vatRate);
  return {
    labourCost: fromCents(labour),
    materialsCost: fromCents(materials),
    fees: fromCents(fees),
    discountAmount: fromCents(discount),
    subtotal: fromCents(subtotal),
    vatAmount: fromCents(vat),
    total: fromCents(subtotal + vat),
  };
}

export interface PayrollInput {
  totalHours: number;
  hourlyRate: number;
  taxRate: number; // e.g. 0.18 for 18% PAYE withholding configured per employee
  uifRate: number; // employee UIF contribution, e.g. 0.01
  uifMonthlyCap: number; // maximum UIF deduction per period
}

export interface PayrollFigures {
  totalHours: number;
  grossPay: number;
  paye: number;
  uif: number;
  deductions: number;
  netPay: number;
}

export function calculatePayroll(input: PayrollInput): PayrollFigures {
  const hours = Math.round(input.totalHours * 100) / 100;
  const gross = Math.round(hours * toCents(input.hourlyRate));
  const paye = Math.round(gross * input.taxRate);
  const uif = Math.min(Math.round(gross * input.uifRate), toCents(input.uifMonthlyCap));
  const deductions = paye + uif;
  return {
    totalHours: hours,
    grossPay: fromCents(gross),
    paye: fromCents(paye),
    uif: fromCents(uif),
    deductions: fromCents(deductions),
    netPay: fromCents(gross - deductions),
  };
}

/** Hours between two instants, rounded to 2 decimals. */
export function hoursBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms < 0) throw new Error('End precedes start');
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** Reward points earned for a settled invoice (points per full `randPerPoint` Rand). */
export function pointsForAmount(amount: number, randPerPoint: number): number {
  if (randPerPoint <= 0) return 0;
  return Math.floor(roundMoney(amount) / randPerPoint);
}

export function tierForLifetimePoints(points: number): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
  if (points >= 10_000) return 'PLATINUM';
  if (points >= 5_000) return 'GOLD';
  if (points >= 1_500) return 'SILVER';
  return 'BRONZE';
}

/** Discount value applied to an outstanding amount (never exceeds the amount). */
export function discountValue(type: 'PERCENT' | 'FIXED', value: number, outstanding: number): number {
  const out = toCents(outstanding);
  const raw = type === 'PERCENT' ? Math.round(out * (value / 100)) : toCents(value);
  return fromCents(Math.max(0, Math.min(raw, out)));
}
