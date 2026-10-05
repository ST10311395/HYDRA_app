import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { OwnerGate } from '../components/admin';
import { canAccessPath, entryRoute, homeForRole, isOwnerOnlyPath, routeAccess } from '../navigation/guards';
import { routeForNotification } from '../hooks/usePushNotifications';
import { mockApi, renderScreen, signInAs } from '../test-utils';

describe('route guards (role-aware navigation)', () => {
  it('guests may browse public pages and auth screens only', () => {
    expect(routeAccess('signedOut', undefined)).toEqual({ welcome: true, auth: true, customer: false, employee: false, admin: false });
    expect(canAccessPath('/', 'signedOut', undefined)).toBe(true);
    expect(canAccessPath('/services', 'signedOut', undefined)).toBe(true);
    expect(canAccessPath('/login', 'signedOut', undefined)).toBe(true);
    expect(canAccessPath('/customer/job/123', 'signedOut', undefined)).toBe(false);
    expect(canAccessPath('/admin', 'signedOut', undefined)).toBe(false);
  });

  it('each role reaches only its own area', () => {
    expect(canAccessPath('/customer', 'signedIn', 'CUSTOMER')).toBe(true);
    expect(canAccessPath('/employee', 'signedIn', 'CUSTOMER')).toBe(false);
    expect(canAccessPath('/admin/jobs', 'signedIn', 'CUSTOMER')).toBe(false);
    expect(canAccessPath('/employee/scan', 'signedIn', 'EMPLOYEE')).toBe(true);
    expect(canAccessPath('/admin/payroll', 'signedIn', 'EMPLOYEE')).toBe(false);
    expect(canAccessPath('/customer/billing', 'signedIn', 'EMPLOYEE')).toBe(false);
    expect(canAccessPath('/admin/job/1?x=1', 'signedIn', 'ADMIN_OFFICE')).toBe(true);
    expect(canAccessPath('/admin', 'signedIn', 'ADMIN_OWNER')).toBe(true);
    expect(canAccessPath('/customer', 'signedIn', 'ADMIN_OWNER')).toBe(false);
  });

  it('signed-in users are kept out of the sign-in screens; loading shows nothing private', () => {
    expect(canAccessPath('/login', 'signedIn', 'CUSTOMER')).toBe(false);
    expect(routeAccess('loading', undefined)).toMatchObject({ customer: false, employee: false, admin: false });
  });

  it('entry route: splash while restoring, welcome for new visitors, public site for guests, role app when signed in', () => {
    expect(entryRoute('loading', undefined, false)).toBeNull();
    expect(entryRoute('signedOut', undefined, false)).toBe('/welcome');
    expect(entryRoute('signedOut', undefined, true)).toBe('/home');
    expect(entryRoute('signedIn', 'CUSTOMER', false)).toBe('/customer');
    expect(entryRoute('signedIn', 'EMPLOYEE', true)).toBe('/employee');
    expect(entryRoute('signedIn', 'ADMIN_OFFICE', false)).toBe('/admin');
    expect(entryRoute('signedIn', 'ADMIN_OWNER', false)).toBe('/admin');
    expect(homeForRole(undefined)).toBe('/');
    expect(canAccessPath('/welcome', 'signedIn', 'CUSTOMER')).toBe(false);
    expect(canAccessPath('/reset-password', 'signedIn', 'EMPLOYEE')).toBe(false);
  });

  it('identifies owner-only admin modules', () => {
    expect(isOwnerOnlyPath('/admin/reports')).toBe(true);
    expect(isOwnerOnlyPath('/admin/audit?entity=job')).toBe(true);
    expect(isOwnerOnlyPath('/admin/invoices')).toBe(false);
  });

  it('push notifications deep-link into the signed-in role area only', () => {
    expect(routeForNotification('CUSTOMER', { jobId: 'j1' })).toBe('/customer/job/j1');
    expect(routeForNotification('EMPLOYEE', { jobId: 'j1' })).toBe('/employee/job/j1');
    expect(routeForNotification('ADMIN_OFFICE', { leaveId: 'l1' })).toBe('/admin/workforce?tab=LEAVE');
    expect(routeForNotification('ADMIN_OWNER', { missedCallId: 'm1' })).toBe('/admin/missed-call/m1');
    expect(routeForNotification('CUSTOMER', { route: '/admin/reports' })).toBeNull();
  });

  it('every navigation target in the app resolves to a real screen (no dead links)', () => {
    const out = execFileSync(process.execPath, [join(__dirname, '../../scripts/check-routes.mjs')], { encoding: 'utf8' });
    expect(out).toMatch(/navigation targets resolve/);
  });
});

describe('role permissions in the admin UI', () => {
  beforeEach(() => mockApi({}));

  it('OwnerGate blocks office admins from owner-only modules', async () => {
    signInAs('ADMIN_OFFICE');
    await renderScreen(<OwnerGate section="Reports"><Text>secret report</Text></OwnerGate>);
    expect(screen.getByText('Owner / manager access only')).toBeOnTheScreen();
    expect(screen.queryByText('secret report')).toBeNull();
  });

  it('OwnerGate renders the module for the owner', async () => {
    signInAs('ADMIN_OWNER');
    await renderScreen(<OwnerGate section="Reports"><Text>secret report</Text></OwnerGate>);
    expect(screen.getByText('secret report')).toBeOnTheScreen();
  });
});
