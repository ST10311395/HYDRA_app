/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Runtime navigation tests. Unlike the static route audit, these mount the real Expo Router with
 * the app's real root navigator (`AppStack` + `Stack.Protected` guards), entry route, welcome
 * gateway and sign-in screen, and drive them like a user. Only `fetch` is faked.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { act } from '@testing-library/react-native';
import { cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import type { AuthSession, Role } from '@hydra/shared';
import Entry from '../app/index';
import LoginScreen from '../app/(auth)/login';
import Welcome from '../app/welcome';
import { OwnerGate } from '../components/admin';
import { AppStack } from '../navigation/AppStack';
import { useAuth } from '../store/auth';
import { apiError, makeUser, mockApi, signInAs, signOutState } from '../test-utils';

// babel-jest hoists this above the imports: these tests need the real router, not the setup fake.
jest.unmock('expo-router');

const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };
const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as { getItem: (k: string) => Promise<string | null>; clear: () => Promise<void> };

function screenText(label: string) {
  return function StubScreen() {
    return <Text>{label}</Text>;
  };
}
const ChildStack = () => <Stack screenOptions={{ headerShown: false }} />;

/** The app's route tree with the real root layout/guards; role screens are lightweight stand-ins. */
const ROUTES = {
  _layout: AppStack,
  index: Entry,
  welcome: Welcome,
  '(public)/_layout': ChildStack,
  '(public)/home': screenText('Public home'),
  '(public)/services': screenText('Public services'),
  '(auth)/_layout': ChildStack,
  '(auth)/login': LoginScreen,
  '(auth)/register': screenText('Register screen'),
  'customer/_layout': ChildStack,
  'customer/index': screenText('Customer dashboard'),
  'customer/billing': screenText('Customer billing'),
  'employee/_layout': ChildStack,
  'employee/index': screenText('Employee dashboard'),
  'admin/_layout': ChildStack,
  'admin/index': screenText('Admin dashboard'),
  'admin/reports': () => (
    <OwnerGate section="Reports">
      <Text>Owner reports</Text>
    </OwnerGate>
  ),
};

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Mounts the router. With RNTL 14 `render` is async, so `renderRouter` returns a promise carrying the
 * pathname helpers; await it for the mounted tree and keep the helpers.
 */
async function start(initialUrl = '/') {
  const pending = renderRouter(ROUTES, { initialUrl, wrapper: Providers });
  const rendered = (await pending) as unknown as { unmount: () => unknown };
  return { getPathname: () => pending.getPathname(), unmount: async () => void (await rendered.unmount()) };
}

function session(role: Role): AuthSession {
  return { user: makeUser(role), accessToken: `access-${role}`, refreshToken: `refresh-${role}` } as AuthSession;
}

async function signInThroughForm(identifier: string) {
  await fireEvent.changeText(screen.getByTestId('login-identifier'), identifier);
  await fireEvent.changeText(screen.getByTestId('login-password'), 'correct horse battery');
  await fireEvent.press(screen.getByTestId('login-submit'));
}

afterEach(async () => {
  await cleanup();
});

beforeEach(async () => {
  signOutState();
  useAuth.setState({ guest: false });
  await AsyncStorage.clear();
  mockApi({});
});

describe('first launch and guest browsing', () => {
  it('shows the branded splash while the session is restored, never the public home', async () => {
    useAuth.setState({ status: 'loading', user: null, accessToken: null });
    const r = await start();
    expect(screen.getByTestId('boot-splash')).toBeOnTheScreen();
    expect(screen.queryByText('Public home')).toBeNull();
    expect(r.getPathname()).toBe('/');
  });

  it('unauthenticated first launch opens the welcome gateway with sign in, register and guest options', async () => {
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    expect(screen.getByTestId('welcome-sign-in')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-register')).toBeOnTheScreen();
    expect(screen.getByTestId('welcome-guest')).toBeOnTheScreen();
  });

  it('Continue as Guest opens the public site and is remembered for the next launch', async () => {
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    await fireEvent.press(screen.getByTestId('welcome-guest'));
    await waitFor(() => expect(r.getPathname()).toBe('/home'));
    expect(screen.getByText('Public home')).toBeOnTheScreen();
    expect(useAuth.getState().guest).toBe(true);
    await waitFor(async () => expect(await AsyncStorage.getItem('hydra.guest-mode')).toBe('1'));
  });

  it('a returning guest goes straight to the public site', async () => {
    useAuth.setState({ guest: true });
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/home'));
  });

  it('guest → Sign In and guest → Register reach the auth screens', async () => {
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    await fireEvent.press(screen.getByTestId('welcome-sign-in'));
    await waitFor(() => expect(r.getPathname()).toBe('/login'));
    await fireEvent.press(screen.getByTestId('auth-back'));
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    await fireEvent.press(screen.getByTestId('welcome-register'));
    await waitFor(() => expect(r.getPathname()).toBe('/register'));
  });

  it('guests can open public pages directly without signing in', async () => {
    const r = await start('/services');
    await waitFor(() => expect(r.getPathname()).toBe('/services'));
    expect(screen.getByText('Public services')).toBeOnTheScreen();
  });
});

describe('one sign-in, role decided by the API', () => {
  const cases: [Role, string, string][] = [
    ['CUSTOMER', '/customer', 'Customer dashboard'],
    ['EMPLOYEE', '/employee', 'Employee dashboard'],
    ['ADMIN_OFFICE', '/admin', 'Admin dashboard'],
    ['ADMIN_OWNER', '/admin', 'Admin dashboard'],
  ];

  it.each(cases)('%s login lands on %s', async (role, path, text) => {
    const api = mockApi({ 'POST /auth/login': () => session(role) });
    const r = await start('/login');
    await waitFor(() => expect(r.getPathname()).toBe('/login'));
    await signInThroughForm(`${role.toLowerCase()}@hydra.test`);
    await waitFor(() => expect(r.getPathname()).toBe(path));
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(api.find('POST', '/auth/login')).toHaveLength(1);
    // Nothing role-related is sent by the client — the role comes back from the server.
    expect(api.find('POST', '/auth/login')[0]!.body).toEqual({ identifier: `${role.toLowerCase()}@hydra.test`, password: 'correct horse battery' });
  });

  it('shows a clear, disabled "not configured" Google state when no client ID is set', async () => {
    const api = mockApi({});
    const r = await start('/login');
    await waitFor(() => expect(r.getPathname()).toBe('/login'));
    expect(screen.getByTestId('google-signin-notice')).toHaveTextContent(/not configured/i);
    await fireEvent.press(screen.getByText('Google Sign-In unavailable'));
    expect(api.find('POST', '/auth/google')).toHaveLength(0);
  });

  it('the "Staff sign in" tab is presentation only: a customer account still opens the customer app', async () => {
    mockApi({ 'POST /auth/login': () => session('CUSTOMER') });
    const r = await start('/login?audience=staff');
    await waitFor(() => expect(screen.getByText('Work email or staff number')).toBeOnTheScreen());
    await signInThroughForm('customer@hydra.test');
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
  });

  it('owner sees owner-only modules; office admin is blocked from them', async () => {
    signInAs('ADMIN_OWNER');
    const owner = await start('/admin/reports');
    await waitFor(() => expect(screen.getByText('Owner reports')).toBeOnTheScreen());
    await owner.unmount();

    signInAs('ADMIN_OFFICE');
    await start('/admin/reports');
    await waitFor(() => expect(screen.getByText('Owner / manager access only')).toBeOnTheScreen());
    expect(screen.queryByText('Owner reports')).toBeNull();
  });
});

describe('session lifecycle', () => {
  it('restores a stored session and opens the role app (role from the refresh response)', async () => {
    SecureStore.__store.set('hydra.refreshToken', 'stored-refresh');
    const api = mockApi({ 'POST /auth/refresh': () => session('EMPLOYEE') });
    useAuth.setState({ status: 'loading' });
    const r = await start();
    expect(screen.getByTestId('boot-splash')).toBeOnTheScreen();
    await act(async () => {
      await useAuth.getState().bootstrap();
    });
    await waitFor(() => expect(r.getPathname()).toBe('/employee'));
    expect(api.find('POST', '/auth/refresh')[0]!.body).toEqual({ refreshToken: 'stored-refresh' });
  });

  it('an expired / revoked session returns to the welcome gateway and discards the token', async () => {
    SecureStore.__store.set('hydra.refreshToken', 'revoked');
    mockApi({ 'POST /auth/refresh': () => apiError(401, 'UNAUTHENTICATED', 'Session expired') });
    useAuth.setState({ status: 'loading' });
    const r = await start();
    await act(async () => {
      await useAuth.getState().bootstrap();
    });
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    expect(SecureStore.__store.has('hydra.refreshToken')).toBe(false);
  });

  it('a session that expires while in use drops the user back to the gateway', async () => {
    signInAs('CUSTOMER');
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
    await act(async () => {
      await useAuth.getState().signOut({ remote: false });
    });
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    expect(screen.queryByText('Customer dashboard')).toBeNull();
  });

  it('logout returns to the welcome gateway and clears guest mode', async () => {
    mockApi({ 'POST /auth/logout': () => ({}) });
    useAuth.setState({ guest: true });
    signInAs('EMPLOYEE');
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/employee'));
    await act(async () => {
      await useAuth.getState().signOut();
    });
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    expect(useAuth.getState().guest).toBe(false);
  });
});

describe('guards cannot be bypassed by URL, deep link or back navigation', () => {
  it('employee cannot open admin routes — the deep link falls back to their own app', async () => {
    signInAs('EMPLOYEE');
    const r = await start('/admin');
    await waitFor(() => expect(r.getPathname()).toBe('/employee'));
    expect(screen.getByText('Employee dashboard')).toBeOnTheScreen();
    expect(screen.queryByText('Admin dashboard')).toBeNull();
  });

  it('customer cannot open employee routes', async () => {
    signInAs('CUSTOMER');
    const r = await start('/employee');
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
    expect(screen.queryByText('Employee dashboard')).toBeNull();
  });

  it('customer cannot open admin (or owner-only) routes', async () => {
    signInAs('CUSTOMER');
    const r = await start('/admin/reports');
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
    expect(screen.queryByText('Owner reports')).toBeNull();
    expect(screen.queryByText('Owner / manager access only')).toBeNull();
  });

  it.each(['/customer/billing', '/employee', '/admin'])('signed-out visitors opening %s get the welcome gateway', async (url) => {
    const r = await start(url);
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    expect(screen.queryByText(/dashboard|billing/i)).toBeNull();
  });

  it('signed-in users are kept out of the sign-in screens', async () => {
    signInAs('CUSTOMER');
    const r = await start('/login');
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
    expect(screen.queryByTestId('login-submit')).toBeNull();
  });

  it('signed-in users are kept out of the welcome gateway', async () => {
    signInAs('ADMIN_OWNER');
    const r = await start('/welcome');
    await waitFor(() => expect(r.getPathname()).toBe('/admin'));
  });

  it('a client cannot elevate itself with a role query parameter', async () => {
    signInAs('CUSTOMER');
    const r = await start('/admin?role=ADMIN_OWNER');
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
    expect(screen.queryByText('Admin dashboard')).toBeNull();
  });

  it('back after signing in does not return to the login screen', async () => {
    mockApi({ 'POST /auth/login': () => session('CUSTOMER') });
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    await fireEvent.press(screen.getByTestId('welcome-sign-in'));
    await waitFor(() => expect(r.getPathname()).toBe('/login'));
    await signInThroughForm('customer@hydra.test');
    await waitFor(() => expect(r.getPathname()).toBe('/customer'));
    await act(async () => {
      const { router } = jest.requireActual<typeof import('expo-router')>('expo-router');
      if (router.canGoBack()) router.back();
    });
    expect(['/login', '/welcome']).not.toContain(r.getPathname());
    expect(screen.queryByTestId('login-submit')).toBeNull();
  });

  it('back after signing out does not reopen the previous role app', async () => {
    signInAs('ADMIN_OFFICE');
    const r = await start();
    await waitFor(() => expect(r.getPathname()).toBe('/admin'));
    await act(async () => {
      await useAuth.getState().signOut({ remote: false });
    });
    await waitFor(() => expect(r.getPathname()).toBe('/welcome'));
    await act(async () => {
      const { router } = jest.requireActual<typeof import('expo-router')>('expo-router');
      if (router.canGoBack()) router.back();
    });
    expect(r.getPathname()).not.toMatch(/^\/admin/);
    expect(screen.queryByText('Admin dashboard')).toBeNull();
  });
});
