import { ADMIN_ROLES } from '@hydra/shared';
import type { JobRow } from '../repositories/jobRepository';
import type { AuthContext } from '../types/express';
import { forbidden, notFound } from '../utils/errors';

/**
 * Ownership checks (step 4 of spec §17.3, PDF §2.1.1 dual-layer RBAC). Failures return 404 rather than
 * 403 so a caller cannot probe for the existence of another account's records by editing IDs.
 */
export function canAccessJob(auth: AuthContext, job: Pick<JobRow, 'customerId' | 'electricianId'>): boolean {
  if (ADMIN_ROLES.includes(auth.role)) return true;
  if (auth.role === 'CUSTOMER') return !!auth.customerId && job.customerId === auth.customerId;
  if (auth.role === 'EMPLOYEE') return !!auth.employeeId && job.electricianId === auth.employeeId;
  return false;
}

export function assertJobAccess(auth: AuthContext, job: JobRow | null): JobRow {
  if (!job || !canAccessJob(auth, job)) throw notFound('Job');
  return job;
}

export function assertAssignedEmployee(auth: AuthContext, job: JobRow): string {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId) throw forbidden('Only the assigned electrician can perform this action');
  if (job.electricianId !== auth.employeeId) throw notFound('Job');
  return auth.employeeId;
}

export function assertCustomerOwner(auth: AuthContext, customerId: string): void {
  if (auth.role !== 'CUSTOMER' || auth.customerId !== customerId) throw notFound('Record');
}

export const isAdminRole = (auth: AuthContext): boolean => ADMIN_ROLES.includes(auth.role);
export const isOwner = (auth: AuthContext): boolean => auth.role === 'ADMIN_OWNER';
