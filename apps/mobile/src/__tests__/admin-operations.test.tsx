/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { EmployeeAvailabilityDto, InvoiceDto } from '@hydra/shared';
import More from '../app/admin/(tabs)/more';
import AssignElectrician from '../app/admin/assign/[id]';
import AdminInvoice from '../app/admin/invoice/[id]';
import AdminJobDetail from '../app/admin/job/[id]';
import NewInvoice from '../app/admin/new-invoice/[id]';
import QuoteBuilder from '../app/admin/quote/[id]';
import CustomerInvoice from '../app/customer/invoice/[id]';
import { JOB_ID, apiError, makeJob, mockApi, renderScreen, respond, signInAs } from '../test-utils';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  openAuthSessionAsync: jest.fn(async () => ({ type: 'dismiss' })),
  WebBrowserPresentationStyle: { FORM_SHEET: 'formSheet' },
}));

const setParams = (p: Record<string, string>) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);

const employee = (id: string, first: string, available: boolean, conflicts: EmployeeAvailabilityDto['conflicts'] = []): EmployeeAvailabilityDto => ({
  id, userId: `u-${id}`, staffNumber: `PSG-E-${id}`, firstName: first, lastName: 'Dlamini', email: `${first}@x.test`, phone: null, certificationNo: null, specialisation: 'Solar',
  hourlyRate: 250, taxRate: 0.18, isActive: true, clockedIn: false, onLeaveToday: false, activeJobCount: 1, available, conflicts,
});

const invoice = (overrides: Partial<InvoiceDto> = {}): InvoiceDto => ({
  id: 'inv-1', number: 'INV-2026-0007', jobId: JOB_ID, jobReference: 'JOB-2026-0042', quoteId: 'q1', customer: { id: 'cust-1', name: 'Thandi Test', phone: null, email: 't@x.test' },
  status: 'SENT', subtotal: 1500, materialsAdjustment: 0, discountTotal: 0, vatAmount: 225, total: 1725, amountPaid: 0, amountDue: 1725, invoiceDate: '2026-09-25', dueDate: '2026-10-09',
  sentAt: '2026-09-25T08:00:00Z', paidAt: null, notes: null, items: [{ id: 'ii1', description: 'Installation', quantity: 1, unitPrice: 1500, lineTotal: 1500 }], payments: [], discounts: [], ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  setParams({ id: JOB_ID });
});

describe('admin job detail', () => {
  it('shows only the lifecycle actions the server allows', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({ 'GET /jobs/:id': () => makeJob({ status: 'QUOTE_ACCEPTED', allowedActions: ['ASSIGN', 'CANCEL'] }) });
    await renderScreen(<AdminJobDetail />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Assign electrician' }));
    expect(router.push).toHaveBeenCalledWith(`/admin/assign/${JOB_ID}`);
    expect(screen.queryByRole('button', { name: 'Build quote' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generate invoice' })).toBeNull();
  });
});

describe('admin job assignment', () => {
  it('assigns an available electrician for the chosen window', async () => {
    signInAs('ADMIN_OFFICE');
    const job = makeJob({ status: 'QUOTE_ACCEPTED', preferredDate: '2030-01-15', preferredTimeWindow: 'MORNING', allowedActions: ['ASSIGN'] });
    const m = mockApi({
      'GET /jobs/:id': () => job,
      'GET /jobs/availability/electricians': () => [employee('0001', 'Sipho', true), employee('0002', 'Anele', false, [{ type: 'LEAVE', title: 'Annual leave', startAt: '2030-01-15T06:00:00Z', endAt: '2030-01-15T15:00:00Z' }])],
      'POST /jobs/:id/assign': () => ({ ...job, status: 'SCHEDULED' }),
    });
    await renderScreen(<AssignElectrician />);
    await fireEvent.press(await screen.findByTestId('employee-0001'));
    await fireEvent.press(screen.getByTestId('assign-submit'));
    await waitFor(() => expect(m.find('POST', `/jobs/${JOB_ID}/assign`)).toHaveLength(1));
    const avail = m.find('GET', '/jobs/availability/electricians')[0]!;
    expect(avail.query).toMatchObject({ start: '2030-01-15T06:00:00.000Z', end: '2030-01-15T10:00:00.000Z', jobId: JOB_ID });
    expect(m.find('POST', `/jobs/${JOB_ID}/assign`)[0]?.body).toEqual({ employeeId: '0001', scheduledStart: '2030-01-15T06:00:00.000Z', scheduledEnd: '2030-01-15T10:00:00.000Z', overrideConflicts: false });
    expect(router.back).toHaveBeenCalled();
  });

  it('requires an explicit, audited override to book over a conflict', async () => {
    signInAs('ADMIN_OFFICE');
    const job = makeJob({ status: 'QUOTE_ACCEPTED', preferredDate: '2030-01-15', allowedActions: ['ASSIGN'] });
    const m = mockApi({
      'GET /jobs/:id': () => job,
      'GET /jobs/availability/electricians': () => [employee('0002', 'Anele', false, [{ type: 'JOB', title: 'JOB-2026-0040', startAt: '2030-01-15T06:00:00Z', endAt: '2030-01-15T08:00:00Z' }])],
      'POST /jobs/:id/assign': () => ({ ...job, status: 'SCHEDULED' }),
    });
    await renderScreen(<AssignElectrician />);
    await fireEvent.press(await screen.findByTestId('employee-0002'));
    expect(screen.getByText('Schedule conflict')).toBeOnTheScreen();
    expect(screen.getByTestId('assign-submit')).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: /Override conflicts/ }));
    await fireEvent.press(screen.getByTestId('assign-submit'));
    await waitFor(() => expect(m.find('POST', `/jobs/${JOB_ID}/assign`)[0]?.body).toMatchObject({ employeeId: '0002', overrideConflicts: true }));
  });

  it('surfaces the server rule when the quote has not been accepted', async () => {
    signInAs('ADMIN_OFFICE');
    const job = makeJob({ status: 'QUOTE_ACCEPTED', preferredDate: '2030-01-15', allowedActions: ['ASSIGN'] });
    mockApi({
      'GET /jobs/:id': () => job,
      'GET /jobs/availability/electricians': () => [employee('0001', 'Sipho', true)],
      'POST /jobs/:id/assign': () => apiError(422, 'QUOTE_NOT_ACCEPTED', 'An electrician can only be assigned after the customer accepts the quote'),
    });
    await renderScreen(<AssignElectrician />);
    await fireEvent.press(await screen.findByTestId('employee-0001'));
    await fireEvent.press(screen.getByTestId('assign-submit'));
    expect(await screen.findByText('An electrician can only be assigned after the customer accepts the quote')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('quote builder', () => {
  it('prefills a labour line from the service price and sends a structured quote', async () => {
    signInAs('ADMIN_OFFICE');
    const job = makeJob({ status: 'REQUESTED', allowedActions: ['CREATE_QUOTE'] });
    const m = mockApi({
      'GET /jobs/:id': () => job,
      'GET /settings': () => ({ vatRate: 0.15 }),
      'GET /service-types/:id': () => ({ id: 'svc-1', basePrice: 1200 }),
      'POST /jobs/:id/quote': () => respond(201, { id: 'q1', version: 1, status: 'SENT' }),
    });
    await renderScreen(<QuoteBuilder />);
    expect(await screen.findByDisplayValue('Labour — Solar PV installation')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('1200')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Material' }));
    await fireEvent.changeText(screen.getAllByLabelText('Description').at(-1)!, '5kW hybrid inverter');
    await fireEvent.changeText(screen.getAllByLabelText('Unit price (R)').at(-1)!, '18500');
    expect(await screen.findByText(/Send quote · R\s?22\s?655\.00/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('quote-submit'));
    await waitFor(() => expect(m.find('POST', `/jobs/${JOB_ID}/quote`)).toHaveLength(1));
    const body = m.find('POST', `/jobs/${JOB_ID}/quote`)[0]!.body as { items: { kind: string; unitPrice: number }[]; send: boolean };
    expect(body.items).toEqual([
      { kind: 'LABOUR', description: 'Labour — Solar PV installation', quantity: 1, unitPrice: 1200 },
      { kind: 'MATERIAL', description: '5kW hybrid inverter', quantity: 1, unitPrice: 18500 },
    ]);
    expect(body.send).toBe(true);
  });

  it('blocks a quote without a labour line (client validation mirrors the server)', async () => {
    signInAs('ADMIN_OFFICE');
    const m = mockApi({
      'GET /jobs/:id': () => makeJob({ allowedActions: ['CREATE_QUOTE'] }),
      'GET /settings': () => ({ vatRate: 0.15 }),
      'GET /service-types/:id': () => ({ id: 'svc-1', basePrice: 1200 }),
    });
    await renderScreen(<QuoteBuilder />);
    await screen.findByDisplayValue('Labour — Solar PV installation');
    await fireEvent.press(screen.getByRole('radio', { name: 'Fee' }));
    await fireEvent.press(screen.getByTestId('quote-submit'));
    expect((await screen.findAllByText('A labour line is required')).length).toBeGreaterThan(0);
    expect(m.find('POST', `/jobs/${JOB_ID}/quote`)).toHaveLength(0);
  });
});

describe('invoice flow', () => {
  it('admin generates an invoice for a completed job and opens it', async () => {
    signInAs('ADMIN_OFFICE');
    const m = mockApi({
      'GET /jobs/:id': () => makeJob({ status: 'COMPLETED', allowedActions: ['GENERATE_INVOICE'] }),
      'GET /settings': () => ({ invoiceIncludeMaterialVariance: false }),
      'POST /jobs/:id/invoice': () => respond(201, invoice()),
    });
    await renderScreen(<NewInvoice />);
    await fireEvent.press(await screen.findByTestId('invoice-submit'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/admin/invoice/inv-1'));
    expect(m.find('POST', `/jobs/${JOB_ID}/invoice`)[0]?.body).toMatchObject({ includeMaterialVariance: false, send: true });
  });

  it('explains why an invoice cannot be generated before completion', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({ 'GET /jobs/:id': () => makeJob({ status: 'IN_PROGRESS', allowedActions: ['REASSIGN'] }), 'GET /settings': () => ({}) });
    await renderScreen(<NewInvoice />);
    expect(await screen.findByText('Invoice not available')).toBeOnTheScreen();
    expect(screen.queryByTestId('invoice-submit')).toBeNull();
  });

  it('admin records an offline part-payment after confirmation', async () => {
    signInAs('ADMIN_OFFICE');
    setParams({ id: 'inv-1' });
    const m = mockApi({
      'GET /invoices/:id': () => invoice(),
      'POST /invoices/:id/manual-payments': () => respond(201, invoice({ status: 'PARTIALLY_PAID', amountPaid: 1000, amountDue: 725 })),
    });
    await renderScreen(<AdminInvoice />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record offline payment' }));
    await fireEvent.changeText(screen.getByLabelText('Amount (R)'), '1000');
    await fireEvent.changeText(screen.getByLabelText('Reference'), 'FNB-EFT-5521');
    await fireEvent.press(screen.getByRole('button', { name: 'Record' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(m.find('POST', '/invoices/inv-1/manual-payments')).toHaveLength(1));
    expect(m.find('POST', '/invoices/inv-1/manual-payments')[0]?.body).toMatchObject({ amount: 1000, method: 'EFT', reference: 'FNB-EFT-5521' });
  });

  it('customer starts a gateway checkout with an idempotency key (no card data in the app)', async () => {
    signInAs('CUSTOMER');
    setParams({ id: 'inv-1' });
    const m = mockApi({
      'GET /invoices/:id': () => invoice(),
      'GET /rewards': () => ({ pointsBalance: 0 }),
      'GET /discounts': () => [],
      'POST /invoices/:id/payments': () => respond(201, { id: 'pay-1', status: 'PENDING', checkoutUrl: 'https://checkout.paystack.com/abc', amount: 1725 }),
      'GET /payments/:id': () => ({ id: 'pay-1', status: 'PENDING' }),
    });
    await renderScreen(<CustomerInvoice />);
    await fireEvent.press(await screen.findByTestId('pay-now'));
    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://checkout.paystack.com/abc', 'hydra://payments/complete', expect.any(Object)));
    const call = m.find('POST', '/invoices/inv-1/payments')[0]!;
    expect(call.headers['Idempotency-Key']).toMatch(/^m-/);
    expect(JSON.stringify(call.body)).not.toMatch(/card|cvv/i);
    await waitFor(() => expect(m.find('GET', '/payments/pay-1').length).toBeGreaterThan(0));
    expect(m.find('GET', '/payments/null')).toHaveLength(0);
  });
});

describe('admin More menu', () => {
  it('hides owner-only modules from office staff', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({
      'GET /dashboard/admin': () => ({ kpis: { lowStockCount: 2, missedCallsToReview: 0, invoicesOutstanding: 1 } }),
      'GET /ai/admin/summary': () => ({ needsReview: 3, urgent: 0, critical: 0, waitingCustomer: 0, accepted: 0 }),
    });
    await renderScreen(<More />);
    expect(await screen.findByRole('button', { name: 'Invoices & payments, 1' })).toBeOnTheScreen();
    expect(await screen.findByRole('button', { name: 'AI Review, 3' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Audit log' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Data exports' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'AI Assistant settings' })).toBeNull();
  });

  it('shows owner modules to the owner and navigates to them', async () => {
    signInAs('ADMIN_OWNER');
    mockApi({
      'GET /dashboard/admin': () => ({ kpis: {} }),
      'GET /ai/admin/summary': () => ({ needsReview: 0, urgent: 1, critical: 1, waitingCustomer: 0, accepted: 0 }),
    });
    await renderScreen(<More />);
    expect(await screen.findByRole('button', { name: 'AI Review, 1 CRITICAL' })).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Audit log' }));
    expect(router.push).toHaveBeenCalledWith('/admin/audit');
    await fireEvent.press(screen.getByRole('button', { name: 'AI Assistant settings' }));
    expect(router.push).toHaveBeenCalledWith('/admin/ai-settings');
  });
});
