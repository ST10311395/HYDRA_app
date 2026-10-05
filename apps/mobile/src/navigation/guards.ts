/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { Role } from '@hydra/shared';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface RouteAccess {
  /** Welcome / auth gateway — only while signed out. */
  welcome: boolean;
  /** Sign-in / registration screens — only while signed out. */
  auth: boolean;
  customer: boolean;
  employee: boolean;
  admin: boolean;
}

export type RoleHome = '/customer' | '/employee' | '/admin';

/**
 * Role-aware navigation guards (spec §36.2). The root Stack mounts each role area only when this
 * returns true, so a deep link to another role's screens cannot render. The API independently
 * enforces the same RBAC on every request — this is defence in depth, not the security boundary.
 * `role` must always be the role returned by the API in the session, never a client-chosen value.
 */
export function routeAccess(status: SessionStatus, role: Role | undefined): RouteAccess {
  const signedIn = status === 'signedIn' && !!role;
  return {
    welcome: status === 'signedOut',
    auth: status === 'signedOut',
    customer: signedIn && role === 'CUSTOMER',
    employee: signedIn && role === 'EMPLOYEE',
    admin: signedIn && (role === 'ADMIN_OFFICE' || role === 'ADMIN_OWNER'),
  };
}

/** Landing area for each authenticated role. Owners use the admin app with owner modules enabled. */
export function homeForRole(role: Role | undefined): RoleHome | '/' {
  switch (role) {
    case 'CUSTOMER':
      return '/customer';
    case 'EMPLOYEE':
      return '/employee';
    case 'ADMIN_OFFICE':
    case 'ADMIN_OWNER':
      return '/admin';
    default:
      return '/';
  }
}

/**
 * Where the app entry (`/`) sends this session: nothing while the session is being restored,
 * the role's own app when signed in, the public site for a visitor who chose guest browsing,
 * otherwise the welcome / sign-in gateway.
 */
export function entryRoute(status: SessionStatus, role: Role | undefined, guest: boolean): RoleHome | '/home' | '/welcome' | null {
  if (status === 'loading') return null;
  if (status === 'signedIn') {
    const home = homeForRole(role);
    return home === '/' ? '/welcome' : home;
  }
  return guest ? '/home' : '/welcome';
}

/** Whether a URL path may be shown for this session (public marketing pages are always allowed). */
export function canAccessPath(path: string, status: SessionStatus, role: Role | undefined): boolean {
  const access = routeAccess(status, role);
  const first = path.split('?')[0]!.split('/').filter(Boolean)[0] ?? '';
  if (first === 'customer') return access.customer;
  if (first === 'employee') return access.employee;
  if (first === 'admin') return access.admin;
  if (first === 'welcome') return access.welcome;
  if (['login', 'register', 'forgot-password', 'reset-password'].includes(first)) return access.auth;
  return true;
}

/** Owner-only admin modules; the API enforces ADMIN_OWNER on the matching endpoints. */
export const OWNER_ONLY_PATHS = ['/admin/reports', '/admin/exports', '/admin/audit', '/admin/staff', '/admin/data-requests'] as const;

export function isOwnerOnlyPath(path: string): boolean {
  const p = path.split('?')[0]!;
  return OWNER_ONLY_PATHS.some((o) => p === o || p.startsWith(`${o}/`));
}
