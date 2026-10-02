import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import type { AuthSession, QuoteDto } from '@hydra/shared';
import LoginScreen from '../app/(auth)/login';
import RequestService from '../app/customer/request';
import QuoteReview from '../app/customer/quote/[id]';
import { useAuth } from '../store/auth';
import { JOB_ID, apiError, makeJob, makeUser, mockApi, renderScreen, respond, signInAs, signOutState } from '../test-utils';

const setParams = (p: Record<string, string>) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);

beforeEach(() => {
  jest.clearAllMocks();
  signOutState();
});

describe('authentication (login screen)', () => {
  it('validates required fields before calling the API', async () => {
    const m = mockApi({});
    await renderScreen(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Enter your password')).toBeOnTheScreen();
    expect(m.find('POST', '/auth/login')).toHaveLength(0);
  });

  it('signs in, stores the session securely and routes by server-issued role', async () => {
    const session: AuthSession = { user: makeUser('EMPLOYEE'), accessToken: 'acc', accessTokenExpiresAt: '2030-01-01T00:00:00Z', refreshToken: 'ref', refreshTokenExpiresAt: '2030-01-01T00:00:00Z' };
    const m = mockApi({ 'POST /auth/login': () => session });
    await renderScreen(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-identifier'), 'PSG-E-0003');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'correct horse battery');
    await fireEvent.press(screen.getByTestId('login-submit'));
    // Hands off to the entry route, which picks the app from the server-issued role
    // (end-to-end routing is covered in runtime-navigation.test.tsx).
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(m.find('POST', '/auth/login')[0]?.body).toEqual({ identifier: 'PSG-E-0003', password: 'correct horse battery' });
    expect(await SecureStore.getItemAsync('hydra.refreshToken')).toBe('ref');
    expect(useAuth.getState().user?.role).toBe('EMPLOYEE');
  });

  it('shows a generic error on bad credentials (no account enumeration)', async () => {
    mockApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Incorrect email/staff number or password.') });
    await renderScreen(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-identifier'), 'someone@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong password 123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Incorrect email/staff number or password.');
    expect(router.replace).not.toHaveBeenCalled();
    expect(useAuth.getState().status).toBe('signedOut');
  });
});

describe('customer service request', () => {
  const services = [{ id: '0b7f6a44-2e4c-4c5e-9d0a-6c1f2b3a4d5e', slug: 'solar', name: 'Solar PV installation', category: 'SOLAR', description: 'x', basePrice: 1000, slaText: null, badge: null, imageKey: null, specs: [], features: [], isActive: true, displayOrder: 1 }];

  it('shows field errors and does not submit an incomplete request', async () => {
    signInAs('CUSTOMER');
    const m = mockApi({ 'GET /service-types': () => services });
    await renderScreen(<RequestService />);
    await fireEvent.press(screen.getByTestId('request-submit'));
    expect(await screen.findByText('Please confirm your contact details')).toBeOnTheScreen();
    expect(m.find('POST', '/jobs')).toHaveLength(0);
  });

  it('creates a REQUESTED job with an idempotency key and opens it', async () => {
    signInAs('CUSTOMER');
    setParams({ serviceTypeId: services[0]!.id });
    const m = mockApi({
      'GET /service-types': () => services,
      'POST /jobs': () => respond(201, makeJob({ status: 'REQUESTED' })),
    });
    await renderScreen(<RequestService />);
    await fireEvent.changeText(screen.getByTestId('request-address'), '12 Main Road, Sandton');
    await fireEvent.changeText(screen.getByTestId('request-description'), 'Main breaker trips when the geyser switches on.');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByTestId('request-submit'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/customer/job/${JOB_ID}`));
    const call = m.find('POST', '/jobs')[0]!;
    expect(call.body).toMatchObject({ serviceTypeId: services[0]!.id, siteAddress: '12 Main Road, Sandton', urgency: 'STANDARD', contactConfirmed: true, attachmentIds: [] });
    expect(call.headers['Idempotency-Key']).toMatch(/^m-/);
  });
});

describe('quote acceptance', () => {
  const quote: QuoteDto = {
    id: 'a1b2c3d4-0000-4000-8000-000000000001', jobId: JOB_ID, jobReference: 'JOB-2026-0042', version: 1, status: 'SENT', labourCost: 1000, materialsCost: 500, fees: 0,
    discountAmount: 0, subtotal: 1500, vatRate: 0.15, vatAmount: 225, total: 1725, validUntil: '2026-10-15', terms: 'Valid 14 days', notes: null, sentAt: '2026-09-21T08:00:00Z',
    respondedAt: null, declineReason: null, items: [{ id: 'i1', kind: 'LABOUR', description: 'Installation labour', quantity: 1, unitPrice: 1000, lineTotal: 1000 }], createdAt: '2026-09-21T08:00:00Z',
  };

  it('accepts only after confirmation, via the server transaction', async () => {
    signInAs('CUSTOMER');
    setParams({ id: quote.id });
    const m = mockApi({ 'GET /quotes/:id': () => quote, [`POST /quotes/${quote.id}/accept`]: () => ({ ...quote, status: 'ACCEPTED' }) });
    await renderScreen(<QuoteReview />);
    await fireEvent.press(await screen.findByTestId('quote-accept'));
    expect(screen.getByText(/Accept quote for/)).toBeOnTheScreen();
    // The confirmation dialog renders last; its confirm button shares the footer button's label.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Accept quote' }).at(-1)!);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/customer/job/${JOB_ID}`));
    expect(m.find('POST', `/quotes/${quote.id}/accept`)).toHaveLength(1);
  });

  it('declines with an optional reason', async () => {
    signInAs('CUSTOMER');
    setParams({ id: quote.id });
    const m = mockApi({ 'GET /quotes/:id': () => quote, [`POST /quotes/${quote.id}/decline`]: () => ({ ...quote, status: 'DECLINED' }) });
    await renderScreen(<QuoteReview />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Decline' }));
    await fireEvent.changeText(screen.getByLabelText('Reason (optional)'), 'Too expensive');
    await fireEvent.press(screen.getByRole('button', { name: 'Decline quote' }));
    await waitFor(() => expect(m.find('POST', `/quotes/${quote.id}/decline`)).toHaveLength(1));
    expect(m.find('POST', `/quotes/${quote.id}/decline`)[0]?.body).toEqual({ reason: 'Too expensive' });
  });

  it('shows no accept/decline actions once a quote is no longer open', async () => {
    signInAs('CUSTOMER');
    setParams({ id: quote.id });
    mockApi({ 'GET /quotes/:id': () => ({ ...quote, status: 'ACCEPTED' }) });
    await renderScreen(<QuoteReview />);
    expect(await screen.findByLabelText('ACCEPTED')).toBeOnTheScreen();
    expect(screen.queryByTestId('quote-accept')).toBeNull();
  });
});
