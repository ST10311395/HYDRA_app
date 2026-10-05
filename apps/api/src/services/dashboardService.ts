/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { AdminDashboardDto, CustomerDashboardDto, EmployeeTodayDto } from '@hydra/shared';
import { db } from '../db/pool';
import { PostgresAuditRepository } from '../repositories/auditRepository';
import { PostgresBillingRepository } from '../repositories/billingRepository';
import { PostgresCommsRepository } from '../repositories/commsRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresMaterialRepository } from '../repositories/materialRepository';
import { PostgresNotificationRepository } from '../repositories/notificationRepository';
import { PostgresQuoteRepository } from '../repositories/quoteRepository';
import { PostgresUserRepository } from '../repositories/userRepository';
import { PostgresWorkforceRepository } from '../repositories/workforceRepository';
import type { AuthContext } from '../types/express';
import { addDays, todayIso } from '../utils/dates';
import { forbidden } from '../utils/errors';
import { jobKpis } from './jobService';
import { rewardsSummary } from './rewardsService';

const ACTIVE_CUSTOMER = ['REQUESTED', 'QUOTED', 'QUOTE_ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'INSPECTION_PENDING', 'COMPLETED', 'INVOICED', 'PARTIALLY_PAID'] as const;

export async function customerDashboard(auth: AuthContext): Promise<CustomerDashboardDto> {
  if (auth.role !== 'CUSTOMER' || !auth.customerId) throw forbidden();
  const q = db();
  const [user, rewards, jobs, quotes, invoices, notifications, unread] = await Promise.all([
    new PostgresUserRepository(q).findById(auth.userId),
    rewardsSummary(auth),
    new PostgresJobRepository(q).list({ customerId: auth.customerId, statuses: [...ACTIVE_CUSTOMER], sort: 'newest', limit: 10, offset: 0 }),
    new PostgresQuoteRepository(q).list({ customerId: auth.customerId, status: 'SENT', limit: 5, offset: 0 }),
    new PostgresBillingRepository(q).listInvoices({ customerId: auth.customerId, limit: 20, offset: 0 }),
    new PostgresNotificationRepository(q).recent(auth.userId, 5),
    new PostgresNotificationRepository(q).unreadCount(auth.userId),
  ]);
  const priority = ['IN_PROGRESS', 'INSPECTION_PENDING', 'SCHEDULED', 'QUOTED', 'QUOTE_ACCEPTED', 'REQUESTED'];
  const active = [...jobs.items].sort((a, b) => {
    const pa = priority.indexOf(a.status);
    const pb = priority.indexOf(b.status);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  return {
    firstName: user?.firstName ?? '',
    onboardingCompleted: !!user?.onboardingCompletedAt,
    rewards,
    activeJob: active[0] ?? null,
    activeJobs: active,
    quotesAwaiting: quotes.items.map((x) => ({ id: x.id, jobId: x.jobId, jobReference: x.jobReference, total: x.total, validUntil: x.validUntil })),
    invoicesDue: invoices.items
      .filter((i) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && i.amountDue > 0)
      .map((i) => ({ id: i.id, number: i.number, amountDue: i.amountDue, dueDate: i.dueDate, status: i.status })),
    recentNotifications: notifications,
    unreadNotifications: unread,
  };
}

export async function employeeToday(auth: AuthContext): Promise<EmployeeTodayDto> {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden();
  const q = db();
  const today = todayIso();
  const workforce = new PostgresWorkforceRepository(q);
  const jobs = new PostgresJobRepository(q);
  const [emp, user, openShift, todayHours, todays, upcoming, active, leave, notifications, unread, assigned, later] = await Promise.all([
    workforce.employeeDto(auth.employeeId),
    new PostgresUserRepository(q).findById(auth.userId),
    workforce.openShift(auth.employeeId),
    workforce.hoursOn(auth.employeeId, today),
    jobs.list({ electricianId: auth.employeeId, statuses: ['SCHEDULED', 'IN_PROGRESS', 'INSPECTION_PENDING'], from: today, to: today, sort: 'scheduled', limit: 20, offset: 0 }),
    jobs.list({ electricianId: auth.employeeId, statuses: ['SCHEDULED'], from: addDays(today, 1), to: addDays(today, 3), sort: 'scheduled', limit: 10, offset: 0 }),
    jobs.list({ electricianId: auth.employeeId, statuses: ['IN_PROGRESS', 'INSPECTION_PENDING'], sort: 'scheduled', limit: 10, offset: 0 }),
    workforce.listLeave({ employeeId: auth.employeeId, status: 'PENDING', limit: 5, offset: 0 }),
    new PostgresNotificationRepository(q).recent(auth.userId, 5),
    new PostgresNotificationRepository(q).unreadCount(auth.userId),
    jobs.list({ electricianId: auth.employeeId, statuses: ['SCHEDULED', 'IN_PROGRESS', 'INSPECTION_PENDING'], sort: 'scheduled', limit: 1, offset: 0 }),
    // Next booking beyond the 3-day look-ahead, so "nothing today" never hides later work.
    jobs.list({ electricianId: auth.employeeId, statuses: ['SCHEDULED'], from: addDays(today, 1), sort: 'scheduled', limit: 1, offset: 0 }),
  ]);
  const todaysJobs = [...new Map([...active.items, ...todays.items].map((j) => [j.id, j])).values()];
  const pendingTasks = active.items.map((j) => ({
    jobId: j.id,
    jobReference: j.reference,
    task: j.status === 'INSPECTION_PENDING' ? 'Submit inspection & compliance report' : 'Log materials and complete work',
  }));
  const next = todaysJobs.find((j) => j.status === 'SCHEDULED') ?? upcoming.items[0] ?? later.items[0] ?? null;
  return {
    employee: { id: auth.employeeId, name: emp ? `${emp.firstName} ${emp.lastName}` : '', staffNumber: user?.staffNumber ?? null },
    openShift,
    todayHours,
    nextJob: next,
    todaysJobs,
    upcomingJobs: upcoming.items,
    assignedOpenJobs: assigned.total,
    pendingTasks,
    pendingLeave: leave.items,
    recentNotifications: notifications,
    unreadNotifications: unread,
  };
}

export async function adminDashboard(auth: AuthContext): Promise<AdminDashboardDto> {
  const q = db();
  const jobs = new PostgresJobRepository(q);
  const [kpi, invoices, lowStock, clockedIn, pendingLeave, newEnquiries, missed, revenue, urgent, active, activity, unread] = await Promise.all([
    jobKpis(),
    q.query<{ n: number; amount: number }>(`SELECT count(*)::int AS n, COALESCE(SUM(amount_due),0)::float8 AS amount FROM invoices WHERE status IN ('SENT','PARTIALLY_PAID','OVERDUE')`),
    new PostgresMaterialRepository(q).lowStockCount(),
    new PostgresWorkforceRepository(q).clockedInCount(),
    new PostgresWorkforceRepository(q).pendingLeaveCount(),
    new PostgresCommsRepository(q).newQueryCount(),
    new PostgresCommsRepository(q).missedCallsToReview(),
    q.query<{ amount: number }>(`SELECT COALESCE(SUM(amount),0)::float8 AS amount FROM payments WHERE status='SUCCEEDED' AND paid_at >= date_trunc('month', now())`),
    jobs.list({ urgency: 'EMERGENCY', statuses: ['REQUESTED', 'QUOTED', 'QUOTE_ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'], sort: 'newest', limit: 5, offset: 0 }),
    jobs.list({ statuses: ['SCHEDULED', 'IN_PROGRESS', 'INSPECTION_PENDING'], sort: 'scheduled', limit: 8, offset: 0 }),
    new PostgresAuditRepository(q).recent(12),
    new PostgresNotificationRepository(q).unreadCount(auth.userId),
  ]);
  return {
    kpis: {
      ...kpi,
      invoicesOutstanding: invoices.rows[0]?.n ?? 0,
      outstandingAmount: invoices.rows[0]?.amount ?? 0,
      lowStockCount: lowStock,
      staffClockedIn: clockedIn,
      pendingLeave,
      newEnquiries,
      missedCallsToReview: missed,
      revenueThisMonth: revenue.rows[0]?.amount ?? 0,
    },
    urgentJobs: urgent.items,
    activeJobs: active.items,
    recentActivity: activity.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, actorName: a.actorName, createdAt: a.createdAt })),
    unreadNotifications: unread,
  };
}
