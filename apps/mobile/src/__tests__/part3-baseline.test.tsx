/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Part 3 baseline: the client redesign may move entry points but must not remove a screen, leave a
 * tab without its file, or expose owner-only modules to office admins through a deep link.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { act, screen, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import AiSettings from '../app/admin/ai-settings';
import Audit from '../app/admin/audit';
import DataRequests from '../app/admin/data-requests';
import Exports from '../app/admin/exports';
import Reports from '../app/admin/reports';
import Staff from '../app/admin/staff';
import { isOwnerOnlyPath } from '../navigation/guards';
import { mockApi, renderScreen, signInAs } from '../test-utils';

const appDir = join(__dirname, '../app');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** File routes as URLs: groups stripped, `index` collapses to its parent (same rules as check-routes). */
function fileRoutes(): string[] {
  return walk(appDir)
    .filter((f) => /\.tsx?$/.test(f) && !/(^|[\\/])_layout\.tsx?$/.test(f) && !f.includes('+'))
    .map((f) => {
      const segs = relative(appDir, f).replace(/\.tsx?$/, '').split(sep).filter((s) => !/^\(.*\)$/.test(s));
      if (segs[segs.length - 1] === 'index') segs.pop();
      return '/' + segs.join('/');
    });
}

/** Every screen that existed before Part 3 (recorded from `main` @ 2f4900d). */
const BASELINE_ROUTES = [
  '/', '/welcome', '/payments/complete',
  // Guest / public
  '/home', '/services', '/work', '/quote', '/contact', '/faq', '/partners', '/privacy', '/team', '/why-psg', '/project/[id]', '/service/[id]',
  // Auth
  '/login', '/register', '/forgot-password', '/reset-password',
  // Customer
  '/customer', '/customer/jobs', '/customer/rewards', '/customer/billing', '/customer/profile', '/customer/request', '/customer/job/[id]',
  '/customer/quote/[id]', '/customer/invoice/[id]', '/customer/report/[id]', '/customer/qr/[id]', '/customer/ai', '/customer/ai/new',
  '/customer/ai/[id]', '/customer/notifications', '/customer/onboarding',
  // Employee
  '/employee', '/employee/calendar', '/employee/scan', '/employee/timesheet', '/employee/profile', '/employee/jobs', '/employee/job/[id]',
  '/employee/inspection/[id]', '/employee/materials/[id]', '/employee/report/[id]', '/employee/leave', '/employee/notifications',
  // Admin / owner
  '/admin', '/admin/enquiries', '/admin/jobs', '/admin/workforce', '/admin/more', '/admin/ai-analytics', '/admin/ai-case/[id]', '/admin/ai-entry/[id]',
  '/admin/ai-knowledge', '/admin/ai-review', '/admin/ai-settings', '/admin/assign/[id]', '/admin/audit', '/admin/compliance', '/admin/customer/[id]',
  '/admin/customers', '/admin/data-requests', '/admin/discounts', '/admin/employee/[id]', '/admin/enquiry/[id]', '/admin/exports', '/admin/inventory',
  '/admin/invoice/[id]', '/admin/invoices', '/admin/job/[id]', '/admin/material/[id]', '/admin/materials/[id]', '/admin/missed-call/[id]',
  '/admin/missed-calls', '/admin/new-invoice/[id]', '/admin/new-job', '/admin/notifications', '/admin/payroll', '/admin/profile', '/admin/quote/[id]',
  '/admin/report/[id]', '/admin/reports', '/admin/schedule', '/admin/services', '/admin/settings', '/admin/staff',
];

const TAB_LAYOUTS = {
  guest: '(public)/(tabs)',
  customer: 'customer/(tabs)',
  employee: 'employee/(tabs)',
  admin: 'admin/(tabs)',
} as const;

function tabNames(dir: string): string[] {
  const src = readFileSync(join(appDir, dir, '_layout.tsx'), 'utf8');
  return [...src.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]!);
}

describe('Part 3 baseline: screens and tabs', () => {
  it('every pre-Part 3 screen still exists as a file route', () => {
    const routes = new Set(fileRoutes());
    expect(BASELINE_ROUTES.filter((r) => !routes.has(r))).toEqual([]);
  });

  it.each(Object.entries(TAB_LAYOUTS))('%s tab bar keeps 4–5 destinations, each backed by a screen file', (_role, dir) => {
    const names = tabNames(dir);
    expect(names.length).toBeGreaterThanOrEqual(4);
    expect(names.length).toBeLessThanOrEqual(5);
    const files = readdirSync(join(appDir, dir)).map((f) => f.replace(/\.tsx?$/, ''));
    expect(names.filter((n) => !files.includes(n))).toEqual([]);
  });
});

const OWNER_SCREENS: [string, string, ComponentType][] = [
  ['/admin/ai-settings', 'AI Assistant', AiSettings],
  ['/admin/audit', 'Audit Log', Audit],
  ['/admin/data-requests', 'Data Requests', DataRequests],
  ['/admin/exports', 'Exports', Exports],
  ['/admin/reports', 'Reports', Reports],
  ['/admin/staff', 'Staff Accounts', Staff],
];

describe('Part 3 baseline: owner-only modules', () => {
  beforeEach(() => mockApi({}));

  it.each(OWNER_SCREENS)('%s is blocked for office admins even when deep-linked', async (_path, _section, Screen) => {
    signInAs('ADMIN_OFFICE');
    await renderScreen(<Screen />);
    expect(await screen.findByText('Owner / manager access only')).toBeOnTheScreen();
  });

  it.each(OWNER_SCREENS)('%s opens for the owner', async (_path, _section, Screen) => {
    signInAs('ADMIN_OWNER');
    const { client } = await renderScreen(<Screen />);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0))); // flush React Query's batched notify
    expect(screen.queryByText('Owner / manager access only')).toBeNull();
  });

  it('owner-only path list covers the modules the API restricts to ADMIN_OWNER', () => {
    for (const p of ['/admin/reports', '/admin/exports', '/admin/audit', '/admin/staff', '/admin/data-requests']) expect(isOwnerOnlyPath(p)).toBe(true);
    for (const p of ['/admin/invoices', '/admin/payroll', '/admin/settings', '/admin/jobs']) expect(isOwnerOnlyPath(p)).toBe(false);
  });
});
