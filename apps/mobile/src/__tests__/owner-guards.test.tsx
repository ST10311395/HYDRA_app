/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/**
 * Part 3 owner permissions (brief §5): owner-only modules stay hidden and blocked for office admins
 * after the navigation redesign. Mounts the real admin layout with Expo Router.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import AdminLayout from '../app/admin/_layout';
import { OWNER_ONLY_PATHS, isOwnerOnlyPath } from '../navigation/guards';
import { mockApi, signInAs } from '../test-utils';

// These tests need the real router, not the setup fake.
jest.unmock('expo-router');

const stub = (label: string) =>
  function Stub() {
    return <Text>{label}</Text>;
  };

const ROUTES = {
  'admin/_layout': AdminLayout,
  'admin/index': stub('Admin dashboard'),
  'admin/invoices': stub('Invoices'),
  'admin/payroll': stub('Payroll'),
  ...Object.fromEntries(OWNER_ONLY_PATHS.map((p) => [p.slice(1), stub(`Owner module ${p}`)])),
};

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>{children}</QueryClientProvider>;
}

async function start(initialUrl: string) {
  const pending = renderRouter(ROUTES, { initialUrl, wrapper: Providers });
  await pending;
  return { getPathname: () => pending.getPathname() };
}

beforeEach(() => mockApi({}));
afterEach(async () => {
  await cleanup();
});

describe('owner-only modules', () => {
  it('include AI Assistant settings alongside reports, exports, audit, staff and POPIA requests', () => {
    expect([...OWNER_ONLY_PATHS].sort()).toEqual(['/admin/ai-settings', '/admin/audit', '/admin/data-requests', '/admin/exports', '/admin/reports', '/admin/staff']);
    expect(isOwnerOnlyPath('/admin/ai-settings')).toBe(true);
    // Shared modules: office admins work here; owner-only actions inside are role-checked by the API.
    expect(isOwnerOnlyPath('/admin/payroll')).toBe(false);
    expect(isOwnerOnlyPath('/admin/settings')).toBe(false);
  });

  it.each(OWNER_ONLY_PATHS)('an office admin deep-linking to %s lands on the dashboard instead', async (path) => {
    signInAs('ADMIN_OFFICE');
    const r = await start(path);
    await waitFor(() => expect(r.getPathname()).not.toBe(path));
    expect(screen.queryByText(`Owner module ${path}`)).toBeNull();
    expect(screen.getByText('Admin dashboard')).toBeOnTheScreen();
  });

  it.each(OWNER_ONLY_PATHS)('the owner opens %s', async (path) => {
    signInAs('ADMIN_OWNER');
    const r = await start(path);
    await waitFor(() => expect(r.getPathname()).toBe(path));
    expect(screen.getByText(`Owner module ${path}`)).toBeOnTheScreen();
  });

  it('office admins keep their shared modules', async () => {
    signInAs('ADMIN_OFFICE');
    const r = await start('/admin/payroll');
    await waitFor(() => expect(r.getPathname()).toBe('/admin/payroll'));
    expect(screen.getByText('Payroll')).toBeOnTheScreen();
  });
});
