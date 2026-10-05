/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Runtime states found on the physical-phone walkthrough: offline / permission-denied screens
 * instead of blank cards (§19, §33), payroll zero-total explanations (§20), shift wording (§17),
 * Employee Today clarity (§16) and photo validation (§24).
 */
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { EmployeeTodayDto, PayrollPreviewLineDto, TimesheetDto } from '@hydra/shared';
import EmployeeToday from '../app/employee/(tabs)/index';
import { AdminList } from '../components/admin';
import { viewState } from '../components/QueryState';
import { shiftOrigin } from '../features/ShiftCard';
import { photoProblem } from '../features/photos';
import { summarisePayroll } from '../features/payrollSummary';
import { usePaged } from '../api/queries';
import { apiError, makeJob, mockApi, renderScreen, signInAs } from '../test-utils';
import { ApiError } from '../api/client';

function Customers() {
  const q = usePaged<{ id: string; name: string }>(['customers'], '/customers');
  return <AdminList section="Customers" items={q.data?.pages.flatMap((p) => p.items) ?? []} query={q} emptyTitle="No customers yet" renderItem={() => null} />;
}

describe('list states: loading → data | empty | offline | denied | error', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('offline (paused query) says so instead of "No customers yet" or endless skeletons', async () => {
    signInAs('ADMIN_OFFICE');
    const api = mockApi({ 'GET /customers': () => ({ items: [], page: 1, pageSize: 20, total: 0 }) });
    onlineManager.setOnline(false);
    // The app's real network mode ('online'): requests pause while the device is offline.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: 'online', gcTime: Infinity } } });
    await render(<QueryClientProvider client={client}><Customers /></QueryClientProvider>);
    expect(await screen.findByText('You’re offline')).toBeOnTheScreen();
    expect(screen.queryByText('No customers yet')).toBeNull();
    expect(api.calls).toHaveLength(0);
    await act(async () => onlineManager.setOnline(true));
    expect(await screen.findByText('No customers yet')).toBeOnTheScreen();
  });

  it('403 shows "No access", other failures show the server reason with Retry, never the empty state', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({ 'GET /customers': () => apiError(403, 'FORBIDDEN', 'Owner / manager access only') });
    await renderScreen(<Customers />);
    expect(await screen.findByText('No access')).toBeOnTheScreen();
    expect(screen.getByText('Owner / manager access only')).toBeOnTheScreen();
    expect(screen.queryByText('No customers yet')).toBeNull();

    mockApi({ 'GET /customers': () => apiError(500, 'INTERNAL', 'Database unavailable') });
    await renderScreen(<Customers />);
    expect(await screen.findByText('Database unavailable')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Try again|Retry/ })).toBeOnTheScreen();
  });

  it('a successful empty list shows the deliberate empty state', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({ 'GET /customers': () => ({ items: [], page: 1, pageSize: 20, total: 0 }) });
    await renderScreen(<Customers />);
    expect(await screen.findByText('No customers yet')).toBeOnTheScreen();
  });

  it('viewState classifies every query outcome', () => {
    const base = { error: null, refetch: () => undefined };
    expect(viewState({ ...base, status: 'pending', fetchStatus: 'fetching' })).toBe('loading');
    expect(viewState({ ...base, status: 'pending', fetchStatus: 'paused' })).toBe('offline');
    expect(viewState({ ...base, status: 'error', fetchStatus: 'idle', error: new ApiError(0, 'NETWORK', 'offline') })).toBe('offline');
    expect(viewState({ ...base, status: 'error', fetchStatus: 'idle', error: new ApiError(403, 'FORBIDDEN', 'no') })).toBe('forbidden');
    expect(viewState({ ...base, status: 'error', fetchStatus: 'idle', error: new ApiError(500, 'X', 'x') })).toBe('error');
    expect(viewState({ ...base, status: 'success', fetchStatus: 'idle' })).toBe('ready');
  });
});

const line = (o: Partial<PayrollPreviewLineDto> = {}): PayrollPreviewLineDto => ({
  employeeId: 'e1', employeeName: 'Sipho Dlamini', hourlyRate: 200, timesheetIds: [], heldTimesheetIds: [], totalHours: 0,
  grossPay: 0, paye: 0, uif: 0, deductions: 0, netPay: 0, alreadyProcessed: false, ...o,
});

describe('payroll zero-total explanation', () => {
  const period = '1 Oct 2026 – 2 Oct 2026';
  it('no confirmed timesheets inside the period', () => {
    const s = summarisePayroll([line(), line({ employeeId: 'e2' })], period);
    expect(s.zeroReason).toBe(`No confirmed timesheets fall within ${period}. Timesheets outside the period are not included — confirm timesheets under Workforce → Timesheets or widen the period.`);
    expect(s.relevant).toHaveLength(0);
    expect(s.idleEmployees).toBe(2);
  });
  it('held for unpaid invoices', () => {
    expect(summarisePayroll([line({ heldTimesheetIds: ['t1', 't2'] })], period).zeroReason).toMatch(/2 confirmed timesheets are held/);
  });
  it('already processed', () => {
    expect(summarisePayroll([line({ alreadyProcessed: true })], period).zeroReason).toMatch(/already been processed/);
  });
  it('hours but a zero rate', () => {
    expect(summarisePayroll([line({ timesheetIds: ['t1'], totalHours: 8, hourlyRate: 0 })], period).zeroReason).toMatch(/8\.00 confirmed hours.*R0\.00/);
  });
  it('something to pay → no explanation, totals add up', () => {
    const s = summarisePayroll([line({ timesheetIds: ['t1'], totalHours: 8, netPay: 1400 }), line({ employeeId: 'e2', timesheetIds: ['t2'], totalHours: 2, netPay: 350 })], period);
    expect(s.zeroReason).toBeNull();
    expect(s.totalNet).toBe(1750);
    expect(s.payableHours).toBe(10);
  });
});

const sheet = (o: Partial<TimesheetDto> = {}): TimesheetDto => ({
  id: 't1', employeeId: 'e1', employeeName: 'Sipho', jobId: null, jobReference: null, workDate: '2026-10-02', clockIn: '2026-10-02T06:00:00Z',
  clockOut: null, totalHours: null, status: 'OPEN', notes: null, payrollId: null, ...o,
});

describe('shift wording', () => {
  it('explains an automatic QR clock-in and flags a shift left open from a previous day', () => {
    expect(shiftOrigin(sheet({ notes: 'Auto clock-in on QR arrival (JOB-1)', jobReference: 'JOB-1' }), '2026-10-02')).toMatchObject({ stale: false, note: 'Started automatically when you checked in to JOB-1 by QR.' });
    expect(shiftOrigin(sheet({ workDate: '2026-09-30' }), '2026-10-02').stale).toBe(true);
    expect(shiftOrigin(sheet(), '2026-10-02')).toMatchObject({ stale: false, note: null });
  });
});

describe('Employee Today', () => {
  const today = (o: Partial<EmployeeTodayDto> = {}): EmployeeTodayDto => ({
    employee: { id: 'e1', name: 'Sipho Dlamini', staffNumber: 'PSG-E-0003' }, openShift: null, todayHours: 0, nextJob: null, todaysJobs: [], upcomingJobs: [],
    assignedOpenJobs: 0, pendingTasks: [], pendingLeave: [], recentNotifications: [], unreadNotifications: 0, ...o,
  });

  it('nothing today but work on other days → points to the assigned jobs, not an apparent load failure', async () => {
    signInAs('EMPLOYEE');
    mockApi({ 'GET /dashboard/employee': () => today({ assignedOpenJobs: 3, nextJob: makeJob({ scheduledStart: '2026-10-09T07:00:00Z' }) }) });
    await renderScreen(<EmployeeToday />);
    expect(await screen.findByText('No jobs scheduled today')).toBeOnTheScreen();
    expect(screen.getByText('You have 3 assigned jobs on other days.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'View assigned jobs (3)' })).toBeOnTheScreen();
  });

  it('no assignments at all says so plainly', async () => {
    signInAs('EMPLOYEE');
    mockApi({ 'GET /dashboard/employee': () => today() });
    await renderScreen(<EmployeeToday />);
    await waitFor(() => expect(screen.getByText(/You have no assigned jobs right now/)).toBeOnTheScreen());
  });
});

describe('photo pre-checks (server re-validates)', () => {
  it('accepts phone photos and rejects other types or oversize files', () => {
    expect(photoProblem({ mimeType: 'image/jpeg', fileSize: 2_000_000 }, 'JOB_PHOTO')).toBeNull();
    expect(photoProblem({ mimeType: 'image/heic' }, 'JOB_PHOTO')).toBeNull();
    expect(photoProblem({ mimeType: 'image/gif' }, 'JOB_PHOTO')).toMatch(/JPG, PNG/);
    expect(photoProblem({ mimeType: 'image/png', fileSize: 9 * 1024 * 1024 }, 'JOB_PHOTO')).toMatch(/larger than 8 MB/);
  });
});
