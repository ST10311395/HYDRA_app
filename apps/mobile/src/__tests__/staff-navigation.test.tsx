/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Part 3 staff navigation: electricians see their day first with everything else grouped under More;
 * office admins and owners get a dashboard split into "needs attention" and "at a glance".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { EmployeeTodayDto } from '@hydra/shared';
import AdminDashboard from '../app/admin/(tabs)/index';
import AdminManage from '../app/admin/(tabs)/more';
import EmployeeToday from '../app/employee/(tabs)/index';
import EmployeeMore from '../app/employee/(tabs)/profile';
import { makeJob, mockApi, renderScreen, renderedText, signInAs } from '../test-utils';

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const tabLabels = (role: string) => [...readFileSync(join(__dirname, `../app/${role}/(tabs)/_layout.tsx`), 'utf8').matchAll(/label: '([^']+)'/g)].map((m) => m[1]);

const today = (o: Partial<EmployeeTodayDto> = {}): EmployeeTodayDto => ({
  employee: { id: 'e1', name: 'Sipho Dlamini', staffNumber: 'PSG-E-0003' }, openShift: null, todayHours: 0, nextJob: null, todaysJobs: [], upcomingJobs: [],
  assignedOpenJobs: 0, pendingTasks: [], pendingLeave: [], recentNotifications: [], unreadNotifications: 0, ...o,
});

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  (router.navigate as jest.Mock).mockClear();
});

describe('electrician navigation', () => {
  beforeEach(() => signInAs('EMPLOYEE'));

  it('keeps the daily workflow on the tab bar with everything else under More', () => {
    expect(tabLabels('employee')).toEqual(['Today', 'Calendar', 'Scan', 'Timesheet', 'More']);
  });

  it('Today lists the day’s jobs before pending tasks and drops the duplicate link grid', async () => {
    const job = makeJob({ reference: 'JOB-2026-0042' });
    mockApi({
      'GET /dashboard/employee': () => today({ todaysJobs: [job], pendingTasks: [{ jobId: job.id, jobReference: 'JOB-2026-0099', task: 'Submit inspection' }] }),
      'GET /notifications': () => ({ items: [], unread: 0 }),
    });
    const { client } = await renderScreen(<EmployeeToday />);
    await settle(client);
    expect(screen.queryByText('My workspace')).toBeNull();
    const text = renderedText(screen.toJSON());
    expect(text.indexOf('JOB-2026-0042')).toBeGreaterThan(-1);
    expect(text.indexOf('JOB-2026-0042')).toBeLessThan(text.indexOf('Pending tasks'));
    await fireEvent.press(screen.getByRole('link', { name: /^All jobs/ }));
    expect(router.push).toHaveBeenCalledWith('/employee/jobs');
  });

  it.each([
    ['All assigned jobs', '/employee/jobs'],
    ['Log materials', '/employee/jobs?focus=materials'],
    ['Inspection / CoC', '/employee/jobs?focus=inspection'],
    ['My leave requests', '/employee/leave'],
    ['Notifications', '/employee/notifications'],
  ])('More links to %s', async (label, route) => {
    mockApi({ 'GET /notifications': () => ({ items: [], unread: 0 }) });
    const { client } = await renderScreen(<EmployeeMore />);
    await settle(client);
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(router.push).toHaveBeenCalledWith(route);
  });
});

const ADMIN_DASH = {
  kpis: { activeJobs: 4, requestedJobs: 2, quotesAwaiting: 1, invoicesOutstanding: 3, outstandingAmount: 5400, lowStockCount: 0, staffClockedIn: 2, pendingLeave: 0, newEnquiries: 5, missedCallsToReview: 1, revenueThisMonth: 42000 },
  urgentJobs: [], activeJobs: [], recentActivity: [], unreadNotifications: 0,
};

describe('office admin and owner navigation', () => {
  beforeEach(() => {
    mockApi({
      'GET /dashboard/admin': () => ADMIN_DASH,
      'GET /ai/admin/summary': () => ({ needsReview: 0, urgent: 0, critical: 0, waitingCustomer: 0, accepted: 0 }),
      'GET /notifications': () => ({ items: [], unread: 0 }),
    });
  });

  it('keeps four work tabs and one organised Manage area', () => {
    expect(tabLabels('admin')).toEqual(['Dashboard', 'Enquiries', 'Jobs', 'Workforce', 'Manage']);
  });

  it('the dashboard separates work that needs attention from status figures', async () => {
    signInAs('ADMIN_OFFICE');
    const { client } = await renderScreen(<AdminDashboard />);
    await screen.findByTestId('admin-ai-card'); // the AI summary loads separately from the KPIs
    await settle(client);
    const attention = renderedText(screen.getByTestId('kpis-attention'));
    const glance = renderedText(screen.getByTestId('kpis-glance'));
    for (const k of ['New requests', 'New enquiries', 'Quotes awaiting', 'Missed calls to review']) expect(attention).toContain(k);
    for (const k of ['Active jobs', 'Staff clocked in', 'Invoices outstanding']) expect(glance).toContain(k);
    expect(screen.getByText('Urgent faults')).toBeOnTheScreen();
    expect(screen.queryByText(/emergency/i)).toBeNull();
  });

  it('Manage search narrows the modules', async () => {
    signInAs('ADMIN_OFFICE');
    const { client } = await renderScreen(<AdminManage />);
    await settle(client);
    await fireEvent.changeText(screen.getByLabelText(/^Search, e\.g\./), 'payroll');
    expect(screen.getByRole('button', { name: 'Payroll' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Customers' })).toBeNull();
  });

  it('search never reveals owner-only modules to an office admin', async () => {
    signInAs('ADMIN_OFFICE');
    const { client } = await renderScreen(<AdminManage />);
    await settle(client);
    await fireEvent.changeText(screen.getByLabelText(/^Search, e\.g\./), 'audit');
    expect(screen.queryByRole('button', { name: 'Audit log' })).toBeNull();
    expect(screen.getByText('Nothing matches')).toBeOnTheScreen();
  });

  it('the owner finds owner modules through search', async () => {
    signInAs('ADMIN_OWNER');
    const { client } = await renderScreen(<AdminManage />);
    await settle(client);
    await fireEvent.changeText(screen.getByLabelText(/^Search, e\.g\./), 'audit');
    await fireEvent.press(screen.getByRole('button', { name: 'Audit log' }));
    expect(router.push).toHaveBeenCalledWith('/admin/audit');
  });
});
