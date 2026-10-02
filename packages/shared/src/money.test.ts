import { describe, expect, it } from 'vitest';
import {
  calculatePayroll,
  calculateQuoteTotals,
  discountValue,
  formatZar,
  hoursBetween,
  pointsForAmount,
  sumMoney,
  tierForLifetimePoints,
} from './money.js';

describe('money', () => {
  it('sums without floating point drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it('calculates quote totals with VAT and discount', () => {
    const t = calculateQuoteTotals(
      [
        { kind: 'LABOUR', quantity: 4, unitPrice: 450 },
        { kind: 'MATERIAL', quantity: 2, unitPrice: 199.99 },
        { kind: 'FEE', quantity: 1, unitPrice: 350 },
      ],
      100,
      0.15,
    );
    expect(t.labourCost).toBe(1800);
    expect(t.materialsCost).toBe(399.98);
    expect(t.fees).toBe(350);
    expect(t.subtotal).toBe(2449.98);
    expect(t.vatAmount).toBe(367.5);
    expect(t.total).toBe(2817.48);
  });

  it('never discounts more than the gross amount', () => {
    const t = calculateQuoteTotals([{ kind: 'LABOUR', quantity: 1, unitPrice: 100 }], 500, 0);
    expect(t.total).toBe(0);
  });

  it('calculates payroll figures', () => {
    const p = calculatePayroll({ totalHours: 160, hourlyRate: 185.5, taxRate: 0.18, uifRate: 0.01, uifMonthlyCap: 177.12 });
    expect(p.grossPay).toBe(29680);
    expect(p.paye).toBe(5342.4);
    expect(p.uif).toBe(177.12);
    expect(p.netPay).toBe(24160.48);
  });

  it('computes hours between timestamps', () => {
    expect(hoursBetween(new Date('2026-01-01T08:00:00Z'), new Date('2026-01-01T16:30:00Z'))).toBe(8.5);
    expect(() => hoursBetween(new Date('2026-01-02'), new Date('2026-01-01'))).toThrow();
  });

  it('awards points per full rand-per-point', () => {
    expect(pointsForAmount(2817.48, 10)).toBe(281);
    expect(pointsForAmount(9.99, 10)).toBe(0);
  });

  it('derives tiers', () => {
    expect(tierForLifetimePoints(0)).toBe('BRONZE');
    expect(tierForLifetimePoints(1500)).toBe('SILVER');
    expect(tierForLifetimePoints(12000)).toBe('PLATINUM');
  });

  it('caps discounts at the outstanding amount', () => {
    expect(discountValue('PERCENT', 10, 2500)).toBe(250);
    expect(discountValue('FIXED', 500, 300)).toBe(300);
  });

  it('formats ZAR', () => {
    expect(formatZar(1234567.5)).toBe('R 1 234 567.50');
  });
});
