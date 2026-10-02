import { describe, expect, it } from 'vitest';
import { allowedJobEvents, canTransitionInvoice, nextJobStatus, TERMINAL_JOB_STATUSES } from './lifecycle.js';
import { JOB_STATUSES } from './enums.js';

describe('job lifecycle', () => {
  it('follows the happy path from request to paid', () => {
    let s = nextJobStatus('REQUESTED', 'SEND_QUOTE');
    expect(s).toBe('QUOTED');
    s = nextJobStatus(s!, 'ACCEPT_QUOTE');
    expect(s).toBe('QUOTE_ACCEPTED');
    s = nextJobStatus(s!, 'ASSIGN');
    expect(s).toBe('SCHEDULED');
    s = nextJobStatus(s!, 'CHECK_IN');
    expect(s).toBe('IN_PROGRESS');
    s = nextJobStatus(s!, 'COMPLETE_WORK');
    expect(s).toBe('INSPECTION_PENDING');
    s = nextJobStatus(s!, 'INSPECTION_PASSED');
    expect(s).toBe('COMPLETED');
    s = nextJobStatus(s!, 'ISSUE_INVOICE');
    expect(s).toBe('INVOICED');
    s = nextJobStatus(s!, 'PARTIAL_PAYMENT');
    expect(s).toBe('PARTIALLY_PAID');
    s = nextJobStatus(s!, 'FULL_PAYMENT');
    expect(s).toBe('PAID');
  });

  it('rejects assignment before quote acceptance', () => {
    expect(nextJobStatus('REQUESTED', 'ASSIGN')).toBeNull();
    expect(nextJobStatus('QUOTED', 'ASSIGN')).toBeNull();
  });

  it('rejects invoicing before inspection passes', () => {
    expect(nextJobStatus('IN_PROGRESS', 'ISSUE_INVOICE')).toBeNull();
    expect(nextJobStatus('INSPECTION_PENDING', 'ISSUE_INVOICE')).toBeNull();
  });

  it('sends a failed inspection back to in-progress', () => {
    expect(nextJobStatus('INSPECTION_PENDING', 'INSPECTION_FAILED')).toBe('IN_PROGRESS');
  });

  it('allows cancellation only from active pre-completion states', () => {
    expect(nextJobStatus('IN_PROGRESS', 'CANCEL')).toBe('CANCELLED');
    expect(nextJobStatus('COMPLETED', 'CANCEL')).toBeNull();
    expect(nextJobStatus('INVOICED', 'CANCEL')).toBeNull();
  });

  it('has no outgoing transitions from terminal states', () => {
    for (const s of TERMINAL_JOB_STATUSES) expect(allowedJobEvents(s)).toEqual([]);
  });

  it('every non-terminal state has at least one exit', () => {
    for (const s of JOB_STATUSES) {
      if (!TERMINAL_JOB_STATUSES.includes(s)) expect(allowedJobEvents(s).length).toBeGreaterThan(0);
    }
  });
});

describe('invoice lifecycle', () => {
  it('only reaches PAID via a payment transition', () => {
    expect(canTransitionInvoice('DRAFT', 'PAID')).toBe(false);
    expect(canTransitionInvoice('SENT', 'PAID')).toBe(true);
    expect(canTransitionInvoice('PARTIALLY_PAID', 'OVERDUE')).toBe(true);
    expect(canTransitionInvoice('PAID', 'SENT')).toBe(false);
  });
});
