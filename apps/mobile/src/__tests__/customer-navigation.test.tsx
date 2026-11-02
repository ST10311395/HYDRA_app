/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Part 3 customer navigation: Home · My jobs · Request · Billing · Account, a focused dashboard, and
 * every former shortcut (rewards, notifications, certificates, Smart Quote) still one tap away.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import BillingScreen from '../app/customer/(tabs)/billing';
import CustomerDashboard from '../app/customer/(tabs)/index';
import CustomerJobs from '../app/customer/(tabs)/jobs';
import CustomerProfile from '../app/customer/(tabs)/profile';
import { makeTabBar } from '../components/TabBar';
import { mockApi, renderScreen, signInAs } from '../test-utils';

async function settle(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const DASHBOARD = {
  firstName: 'Lerato',
  onboardingCompleted: true,
  rewards: { accountId: 'r1', pointsBalance: 1200, lifetimePoints: 1500, tier: 'SILVER', nextTier: 'GOLD', pointsToNextTier: 500, randPerPoint: 0.1 },
  activeJob: null,
  activeJobs: [],
  quotesAwaiting: [{ id: 'q1', jobId: 'j1', jobReference: 'JOB-2026-0001', total: 2400, validUntil: '2026-12-01' }, { id: 'q2', jobId: 'j2', jobReference: 'JOB-2026-0002', total: 900, validUntil: '2026-12-01' }],
  invoicesDue: [],
  recentNotifications: [],
  unreadNotifications: 0,
};

beforeEach(() => {
  signInAs('CUSTOMER', { firstName: 'Lerato' });
  (router.push as jest.Mock).mockClear();
  (router.navigate as jest.Mock).mockClear();
  mockApi({
    'GET /dashboard/customer': () => DASHBOARD,
    'GET /notifications': () => ({ items: [], unread: 0 }),
  });
});

describe('customer tab bar', () => {
  it('puts the everyday journey first: Home, My jobs, Request, Billing, Account', () => {
    const layout = readFileSync(join(__dirname, '../app/customer/(tabs)/_layout.tsx'), 'utf8');
    expect([...layout.matchAll(/label: '([^']+)'/g)].map((m) => m[1])).toEqual(['Home', 'My jobs', 'Request', 'Billing', 'Account']);
    expect(layout).toMatch(/name: 'request', label: 'Request', icon: 'plus', href: '\/customer\/request', hint: 'Opens the service request form'/);
    // Rewards keeps its own screen (reached from Home, Billing and Account).
    expect(layout).toMatch(/<Tabs\.Screen name="rewards" \/>/);
  });

  it('an action tab opens its screen on top instead of switching tab', async () => {
    const Bar = makeTabBar([
      { name: 'index', label: 'Home', icon: 'home' },
      { name: 'request', label: 'Request', icon: 'plus', href: '/customer/request', hint: 'Opens the service request form' },
    ]);
    const navigate = jest.fn();
    const props = { state: { index: 0, routes: [{ name: 'index', key: 'index-1', params: undefined }] }, navigation: { emit: () => ({ defaultPrevented: false }), navigate } } as unknown as BottomTabBarProps;
    await renderScreen(<Bar {...props} />);
    expect(screen.getByTestId('tab-action-request').props.accessibilityHint).toBe('Opens the service request form');
    await fireEvent.press(screen.getByTestId('tab-action-request'));
    expect(router.push).toHaveBeenCalledWith('/customer/request');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('customer dashboard', () => {
  it('leads with clear actions, including quotes to review with a count', async () => {
    const { client } = await renderScreen(<CustomerDashboard />);
    await settle(client);
    expect(screen.getByText('What would you like to do?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Quotes to review, 2'));
    expect(router.navigate).toHaveBeenCalledWith('/customer/jobs?filter=QUOTES');
  });

  it('drops the duplicate link grid and explore buttons, and never calls the AI estimate instant', async () => {
    const { client } = await renderScreen(<CustomerDashboard />);
    await settle(client);
    expect(screen.queryByText('Everything in your account')).toBeNull();
    expect(screen.queryByText('Explore PSG Electrical')).toBeNull();
    expect(screen.queryByText(/instant/i)).toBeNull();
    expect(screen.getByText(/Our team reviews it before any formal quotation/)).toBeOnTheScreen();
  });

  it('rewards remain one tap away from Home', async () => {
    const { client } = await renderScreen(<CustomerDashboard />);
    await settle(client);
    await fireEvent.press(screen.getByLabelText('Rewards balance'));
    expect(router.navigate).toHaveBeenCalledWith('/customer/rewards');
  });
});

describe('customer account hub', () => {
  it.each([
    ['Rewards', '/customer/rewards'],
    ['Notifications', '/customer/notifications'],
    ['Compliance certificates', '/customer/jobs?filter=CERTIFICATES'],
    ['Smart Quote assessments', '/customer/ai'],
    ['About PSG & services', '/home'],
  ])('links to %s', async (label, route) => {
    const { client } = await renderScreen(<CustomerProfile />);
    await settle(client);
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(router.push).toHaveBeenCalledWith(route);
  });
});

describe('customer jobs, quotes and billing pathways', () => {
  it.each([
    ['QUOTES', 'No quotes to review', /accept or decline/],
    ['CERTIFICATES', 'No certificates yet', /passed inspection/],
    ['ACTIVE', 'No current jobs', /request .* quote .* invoice/],
  ])('the %s filter explains what belongs there when empty', async (filter, title, message) => {
    (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams({ filter });
    mockApi({ 'GET /jobs': () => ({ items: [], page: 1, pageSize: 20, total: 0 }), 'GET /notifications': () => ({ items: [], unread: 0 }) });
    const { client } = await renderScreen(<CustomerJobs />);
    await settle(client);
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
  });

  it('billing links to rewards, which can be used on eligible invoices', async () => {
    mockApi({ 'GET /invoices': () => ({ items: [], page: 1, pageSize: 20, total: 0 }), 'GET /payments': () => ({ items: [], page: 1, pageSize: 20, total: 0 }), 'GET /notifications': () => ({ items: [], unread: 0 }) });
    const { client } = await renderScreen(<BillingScreen />);
    await settle(client);
    await fireEvent.press(screen.getByTestId('billing-rewards'));
    expect(router.navigate).toHaveBeenCalledWith('/customer/rewards');
  });
});
