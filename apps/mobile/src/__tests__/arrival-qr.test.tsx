/**
 * Arrival QR lifecycle regression tests (physical-phone defect: leaving the Arrival QR threw
 * "The wake lock with tag _r_v_ has not activated yet").
 *
 * `expo-keep-awake` is replaced by a fake with the browser implementation's semantics: activation
 * fails when the Screen Wake Lock API is unavailable (plain-http LAN page on a phone), and
 * `deactivate` rejects for a tag that never activated. The navigation test uses the real Expo Router.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, render } from '@testing-library/react-native';
import { cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import ArrivalQr from '../app/customer/qr/[id]';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { apiError, mockApi, signInAs } from '../test-utils';

jest.unmock('expo-router');

jest.mock('expo-keep-awake', () => {
  const held = new Set<string>();
  const state = { available: true, grant: 'ok' as 'ok' | 'fail' | 'pending', pending: [] as (() => void)[] };
  return {
    __held: held,
    __state: state,
    isAvailableAsync: jest.fn(async () => state.available),
    activateKeepAwakeAsync: jest.fn(
      (tag: string) =>
        new Promise<void>((resolve, reject) => {
          if (state.grant === 'fail') return reject(new Error('NotAllowedError: wake lock unavailable'));
          const grant = () => {
            held.add(tag);
            resolve();
          };
          if (state.grant === 'pending') state.pending.push(grant);
          else grant();
        }),
    ),
    deactivateKeepAwake: jest.fn(async (tag: string) => {
      if (!held.has(tag)) throw new Error(`The wake lock with tag ${tag} has not activated yet`);
      held.delete(tag);
    }),
    // The library hook the screen used before the fix — same cleanup as expo-keep-awake 57, except
    // the promise its cleanup drops is recorded here so the test can inspect it.
    __dropped: [] as Promise<unknown>[],
    useKeepAwake: () => {
      const { useEffect, useId } = jest.requireActual<typeof import('react')>('react');
      const tag = useId();
      useEffect(() => {
        const m = jest.requireMock<{ activateKeepAwakeAsync: (t: string) => Promise<void>; deactivateKeepAwake: (t: string) => Promise<void> }>('expo-keep-awake');
        m.activateKeepAwakeAsync(tag).catch(() => undefined);
        return () => void jest.requireMock<{ __dropped: Promise<unknown>[] }>('expo-keep-awake').__dropped.push(m.deactivateKeepAwake(tag).then(() => null, (e: unknown) => e));
      }, [tag]);
    },
  };
});

const KeepAwake = jest.requireMock('expo-keep-awake') as {
  __held: Set<string>;
  __state: { available: boolean; grant: 'ok' | 'fail' | 'pending'; pending: (() => void)[] };
  activateKeepAwakeAsync: jest.Mock;
  deactivateKeepAwake: jest.Mock;
  useKeepAwake: () => void;
  __dropped: Promise<unknown>[];
};

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => void unhandled.push(reason);
beforeAll(() => process.on('unhandledRejection', onUnhandled));
afterAll(() => void process.off('unhandledRejection', onUnhandled));

/** Lets promise callbacks and Node's unhandled-rejection detection run. */
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

const JOB = {
  id: 'job-1',
  reference: 'JOB-000123',
  status: 'SCHEDULED',
  checkins: [],
};

let qrCount = 0;
function apiRoutes(status = 'SCHEDULED') {
  qrCount = 0;
  return mockApi({
    'GET /jobs/:id': () => ({ ...JOB, status }),
    'GET /jobs/:id/qr': () => {
      qrCount += 1;
      return { jobId: 'job-1', jobReference: JOB.reference, token: `tok-${qrCount}`, payload: `HYDRA1:job-1:tok-${qrCount}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    },
    'GET /notifications/unread-count': () => ({ unread: 0 }),
    'GET /public-content': () => ({ company: { hotline: '011 000 0000', emergencyLine: '011 000 0001' } }),
  });
}

beforeEach(() => {
  unhandled.length = 0;
  KeepAwake.__held.clear();
  KeepAwake.__state.available = true;
  KeepAwake.__state.grant = 'ok';
  KeepAwake.__state.pending.length = 0;
  KeepAwake.activateKeepAwakeAsync.mockClear();
  KeepAwake.deactivateKeepAwake.mockClear();
  signInAs('CUSTOMER');
});

function Probe({ active = true }: { active?: boolean }) {
  useKeepScreenAwake(active);
  return null;
}

describe('useKeepScreenAwake', () => {
  it('control: the previous useKeepAwake() cleanup rejects when the lock never activated (the phone crash)', async () => {
    KeepAwake.__state.grant = 'fail';
    function Old() {
      KeepAwake.useKeepAwake();
      return null;
    }
    const r = await render(<Old />);
    await settle();
    await r.unmount();
    // In the app nothing handles this rejection, so it surfaced as an uncaught error on navigation.
    expect(String(await KeepAwake.__dropped.pop())).toMatch(/The wake lock with tag _r_\w+_ has not activated yet/);
  });

  it('never deactivates a lock that failed to activate (insecure web context)', async () => {
    KeepAwake.__state.grant = 'fail';
    const r = await render(<Probe />);
    await settle();
    await r.unmount();
    await settle();
    expect(KeepAwake.deactivateKeepAwake).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it('skips activation entirely where wake lock is unsupported', async () => {
    KeepAwake.__state.available = false;
    const r = await render(<Probe />);
    await settle();
    await r.unmount();
    await settle();
    expect(KeepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled();
    expect(KeepAwake.deactivateKeepAwake).not.toHaveBeenCalled();
  });

  it('releases an acquired lock exactly once', async () => {
    const r = await render(<Probe />);
    await settle();
    expect(KeepAwake.__held.size).toBe(1);
    await r.unmount();
    await settle();
    expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(KeepAwake.__held.size).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it('leaving while activation is still pending releases the lock once it is granted', async () => {
    KeepAwake.__state.grant = 'pending';
    const r = await render(<Probe />);
    await settle();
    await r.unmount();
    await settle();
    expect(KeepAwake.deactivateKeepAwake).not.toHaveBeenCalled();
    await act(async () => KeepAwake.__state.pending.forEach((g) => g()));
    await settle();
    expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(KeepAwake.__held.size).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it('toggling active (focus/blur) acquires and releases cleanly', async () => {
    const r = await render(<Probe active />);
    await settle();
    await r.rerender(<Probe active={false} />);
    await settle();
    expect(KeepAwake.__held.size).toBe(0);
    await r.rerender(<Probe active />);
    await settle();
    expect(KeepAwake.__held.size).toBe(1);
    await r.unmount();
    await settle();
    expect(KeepAwake.__held.size).toBe(0);
    expect(unhandled).toEqual([]);
  });
});

function Dashboard() {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/customer/qr/job-1')}>
      <Text>Open arrival QR</Text>
    </Pressable>
  );
}
const ChildStack = () => <Stack screenOptions={{ headerShown: false }} />;
function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('Customer Dashboard → Arrival QR → leave → reopen → leave (real router)', () => {
  afterEach(async () => {
    await cleanup();
  });

  it.each([
    ['wake lock unavailable (phone browser over http)', 'fail' as const],
    ['wake lock granted (native / https)', 'ok' as const],
  ])('%s: no uncaught error, lock and timers released each time', async (_label, grant) => {
    KeepAwake.__state.grant = grant;
    const api = apiRoutes();
    const pending = renderRouter(
      { _layout: ChildStack, 'customer/_layout': ChildStack, 'customer/index': Dashboard, 'customer/qr/[id]': ArrivalQr },
      { initialUrl: '/customer', wrapper: Providers },
    );
    await pending;
    // renderRouter installs fake timers; this test needs real ones so Node can report unhandled rejections.
    jest.useRealTimers();

    for (let visit = 1; visit <= 2; visit += 1) {
      await fireEvent.press(screen.getByText('Open arrival QR'));
      await waitFor(() => expect(pending.getPathname()).toBe('/customer/qr/job-1'));
      await waitFor(() => expect(screen.getByText('Show this to your electrician')).toBeOnTheScreen());
      await waitFor(() => expect(screen.getByText(/expires in 1[45]:/)).toBeOnTheScreen());
      await settle();
      expect(KeepAwake.__held.size).toBe(grant === 'ok' ? 1 : 0);

      await act(() => router.back());
      await waitFor(() => expect(pending.getPathname()).toBe('/customer'));
      await settle();
      expect(KeepAwake.__held.size).toBe(0);
    }

    expect(api.find('GET', '/jobs/job-1/qr')).toHaveLength(2);
    expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalledTimes(grant === 'ok' ? 2 : 0);
    expect(unhandled).toEqual([]);
  });
});

describe('Arrival QR timers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('rotates once per token before expiry, does not loop after a failed refresh, and clears timers on unmount', async () => {
    let fail = false;
    let n = 0;
    const api = mockApi({
      'GET /jobs/:id': () => JOB,
      'GET /jobs/:id/qr': () => {
        n += 1;
        if (fail) return apiError(503, 'UNAVAILABLE', 'Service unavailable');
        return { jobId: 'job-1', jobReference: JOB.reference, token: `t${n}`, payload: `HYDRA1:job-1:t${n}`, expiresAt: new Date(Date.now() + 60_000).toISOString() };
      },
      'GET /notifications/unread-count': () => ({ unread: 0 }),
    });
    const pending = renderRouter({ _layout: ChildStack, 'customer/qr/[id]': ArrivalQr }, { initialUrl: '/customer/qr/job-1', wrapper: Providers });
    const r = (await pending) as unknown as { unmount: () => Promise<void> };
    await act(async () => void (await jest.advanceTimersByTimeAsync(10)));
    await waitFor(() => expect(api.find('GET', '/jobs/job-1/qr')).toHaveLength(1));

    // Token lives 60 s and is rotated 5 s early.
    await act(async () => void (await jest.advanceTimersByTimeAsync(56_000)));
    await waitFor(() => expect(api.find('GET', '/jobs/job-1/qr')).toHaveLength(2));

    // A failed rotation shows Retry and is not re-requested in a loop.
    fail = true;
    await act(async () => void (await jest.advanceTimersByTimeAsync(56_000)));
    await waitFor(() => expect(api.find('GET', '/jobs/job-1/qr')).toHaveLength(3));
    await act(async () => void (await jest.advanceTimersByTimeAsync(30_000)));
    expect(api.find('GET', '/jobs/job-1/qr')).toHaveLength(3);
    expect(screen.getByText('Service unavailable')).toBeOnTheScreen();

    await r.unmount();
    await act(async () => void (await jest.advanceTimersByTimeAsync(120_000)));
    expect(api.find('GET', '/jobs/job-1/qr')).toHaveLength(3);
  });

  it('shows a status explanation instead of an error when the job is not scheduled yet', async () => {
    apiRoutes('QUOTED');
    await renderRouter({ _layout: ChildStack, 'customer/qr/[id]': ArrivalQr }, { initialUrl: '/customer/qr/job-1', wrapper: Providers });
    await act(async () => void (await jest.advanceTimersByTimeAsync(10)));
    await waitFor(() => expect(screen.getByText('QR not available yet')).toBeOnTheScreen());
    expect(screen.queryByText('We couldn’t load this')).toBeNull();
  });
});
