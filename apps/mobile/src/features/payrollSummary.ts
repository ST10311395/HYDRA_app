/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { PayrollPreviewLineDto } from '@hydra/shared';

export interface PayrollSummary {
  /** Lines that will become draft payroll records. */
  payable: PayrollPreviewLineDto[];
  /** Lines worth showing: anything with confirmed, held or already-processed timesheets. */
  relevant: PayrollPreviewLineDto[];
  totalNet: number;
  /** Confirmed hours inside the period that will be paid now. */
  payableHours: number;
  heldSheets: number;
  processedEmployees: number;
  idleEmployees: number;
  /** Why the total is R0.00 — null when there is something to pay. */
  zeroReason: string | null;
}

/**
 * Explains a payroll preview. The API returns a line for every employee (even with no sheets),
 * so a period without confirmed timesheets used to show a list of R0.00 cards with no reason.
 * Only timesheets whose work date falls inside the period are ever included (server-side).
 */
export function summarisePayroll(lines: PayrollPreviewLineDto[], periodLabel: string): PayrollSummary {
  const payable = lines.filter((l) => !l.alreadyProcessed && l.timesheetIds.length > 0);
  const relevant = lines.filter((l) => l.timesheetIds.length > 0 || l.heldTimesheetIds.length > 0 || l.alreadyProcessed);
  const totalNet = payable.reduce((s, l) => s + l.netPay, 0);
  const payableHours = payable.reduce((s, l) => s + l.totalHours, 0);
  const heldSheets = lines.reduce((s, l) => s + l.heldTimesheetIds.length, 0);
  const processedEmployees = lines.filter((l) => l.alreadyProcessed).length;
  let zeroReason: string | null = null;
  if (totalNet <= 0) {
    if (relevant.length === 0) zeroReason = `No confirmed timesheets fall within ${periodLabel}. Timesheets outside the period are not included — confirm timesheets under Workforce → Timesheets or widen the period.`;
    else if (payable.length === 0 && processedEmployees > 0 && heldSheets === 0) zeroReason = `Payroll for ${periodLabel} has already been processed for everyone with confirmed timesheets. See Payroll records.`;
    else if (payable.length === 0 && heldSheets > 0) zeroReason = `${heldSheets} confirmed timesheet${heldSheets === 1 ? ' is' : 's are'} held until the related job invoice${heldSheets === 1 ? ' is' : 's are'} paid (cash-flow rule in Settings).`;
    else if (payableHours > 0) zeroReason = `${payableHours.toFixed(2)} confirmed hours are in the period, but the hourly rate is R0.00 — set pay rates on the employee profile.`;
    else zeroReason = `No payable hours fall within ${periodLabel}.`;
  }
  return { payable, relevant, totalNet, payableHours, heldSheets, processedEmployees, idleEmployees: lines.length - relevant.length, zeroReason };
}
