/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/* Shared helpers for the mobile Jest suite. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { AuthUser, JobDetailDto, Role } from '@hydra/shared';
import { ConfirmHost, ToastHost, useToast } from '../design-system';
import { useAuth } from '../store/auth';

export interface MockCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

const RESPONSE = Symbol('mock-response');
interface MockResponse {
  [RESPONSE]: true;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Explicit HTTP response for a mock route (plain return values are sent as 200 JSON). */
export function respond(status: number, body?: unknown, headers: Record<string, string> = {}): MockResponse {
  return { [RESPONSE]: true, status, body, headers };
}

export const apiError = (status: number, code: string, message: string) => respond(status, { error: { code, message } });

type Handler = (call: MockCall) => unknown;

/**
 * Replaces `fetch` with a route table keyed by "METHOD /path" (path without /api/v1, `:id`
 * wildcards allowed). Unmatched requests return a structured 404 like the real API.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: MockCall[] = [];
  const entries = Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ') as [string, string];
    const rx = new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, '[^/]+')}$`);
    return { method, rx, handler };
  });
  const fetchMock = jest.fn(async (url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    const call: MockCall = {
      method,
      path,
      query: Object.fromEntries(u.searchParams.entries()),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      headers: init.headers ?? {},
    };
    calls.push(call);
    const match = entries.find((e) => e.method === method && e.rx.test(path));
    let status = 404;
    let body: unknown = { error: { code: 'NOT_FOUND', message: `No mock for ${method} ${path}` } };
    let headers: Record<string, string> = {};
    if (match) {
      const out = match.handler(call);
      if (out && typeof out === 'object' && RESPONSE in out) {
        const r = out as MockResponse;
        status = r.status;
        body = r.body;
        headers = Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      } else {
        status = 200;
        body = out;
      }
    }
    const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
    };
  });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return { calls, fetchMock, find: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path) };
}

export function paged<T>(items: T[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}

export function makeUser(role: Role, extra: Partial<AuthUser> = {}): AuthUser {
  return {
    id: `user-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@hydra.test`,
    role,
    firstName: role === 'CUSTOMER' ? 'Thandi' : role === 'EMPLOYEE' ? 'Sipho' : role === 'ADMIN_OWNER' ? 'Owner' : 'Office',
    lastName: 'Test',
    phone: '082 000 0000',
    staffNumber: role === 'EMPLOYEE' ? 'PSG-E-0003' : null,
    customerId: role === 'CUSTOMER' ? 'cust-1' : null,
    employeeId: role === 'EMPLOYEE' ? 'emp-1' : null,
    adminId: role === 'ADMIN_OFFICE' || role === 'ADMIN_OWNER' ? 'adm-1' : null,
    hasGoogleLink: false,
    onboardingCompleted: true,
    address: role === 'CUSTOMER' ? '1 Test Road, Durban' : null,
    marketingOptIn: false,
    hasPassword: true,
    ...extra,
  };
}

export function signInAs(role: Role, extra: Partial<AuthUser> = {}) {
  const user = makeUser(role, extra);
  useAuth.setState({ status: 'signedIn', user, accessToken: 'test-access-token' });
  return user;
}

export function signOutState() {
  useAuth.setState({ status: 'signedOut', user: null, accessToken: null });
}

export function lastToast() {
  return useToast.getState().message;
}

/** Renders a screen with a fresh React Query client plus the toast and confirm hosts. */
export async function renderScreen(ui: ReactElement) {
  // Infinite GC times: no background timers keep Jest alive after the suite finishes.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, networkMode: 'always' },
      mutations: { retry: false, gcTime: Infinity, networkMode: 'always' },
    },
  });
  const wrap = (node: ReactElement) => (
    <QueryClientProvider client={client}>
      {node}
      <ToastHost />
      <ConfirmHost />
    </QueryClientProvider>
  );
  const utils = await render(wrap(ui));
  return { ...utils, client, rerender: (node: ReactElement) => utils.rerender(wrap(node)) };
}

const UUID = '3f6c2a1e-7b1d-4c55-9a55-1c2d3e4f5a6b';

export function makeJob(overrides: Partial<JobDetailDto> = {}): JobDetailDto {
  return {
    id: UUID,
    reference: 'JOB-2026-0042',
    status: 'REQUESTED',
    urgency: 'STANDARD',
    serviceType: { id: 'svc-1', name: 'Solar PV installation', category: 'SOLAR' },
    siteAddress: '12 Main Road, Sandton',
    customer: { id: 'cust-1', name: 'Thandi Test', phone: '082 000 0000' },
    electrician: null,
    scheduledStart: null,
    scheduledEnd: null,
    preferredDate: null,
    nextMilestone: 'Quote prepared',
    createdAt: '2026-09-20T08:00:00.000Z',
    updatedAt: '2026-09-20T08:00:00.000Z',
    description: 'Install a 5 kW hybrid inverter with battery backup.',
    siteLatitude: null,
    siteLongitude: null,
    preferredTimeWindow: 'MORNING',
    source: 'APP',
    materialsCost: 0,
    cancelledReason: null,
    completedAt: null,
    milestones: [],
    checkins: [],
    notes: [],
    attachments: [],
    materials: [],
    inspections: [],
    quote: null,
    invoice: null,
    assignmentHistory: [],
    timeOnSiteMinutes: null,
    allowedActions: [],
    ...overrides,
  };
}

export const JOB_ID = UUID;

/**
 * Two taps landing in the same frame (before React re-renders the button as busy). RNTL 14 only
 * has async presses, so this overlaps two act() scopes; React's "overlapping act()" notice is the
 * only console error tolerated here — any other error fails the test.
 */
export async function pressTwiceSameFrame(target: Parameters<typeof fireEvent.press>[0]) {
  const errors: unknown[][] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args));
  try {
    await act(async () => {
      await Promise.all([fireEvent.press(target), fireEvent.press(target)]);
    });
  } finally {
    spy.mockRestore();
  }
  const unexpected = errors.filter((a) => !String(a[0]).includes('overlapping act()'));
  if (unexpected.length) throw new Error(`Unexpected console.error during double tap: ${unexpected.map((a) => String(a[0])).join(' | ')}`);
}
