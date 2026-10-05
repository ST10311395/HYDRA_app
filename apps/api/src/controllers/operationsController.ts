/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { Router } from 'express';
import { z } from 'zod';
import {
  LEAVE_STATUSES,
  PAYROLL_STATUSES,
  clockInSchema,
  clockOutSchema,
  createScheduleSchema,
  createStaffSchema,
  decideLeaveSchema,
  employeeUpdateSchema,
  idParam,
  leaveRequestSchema,
  materialListQuery,
  materialSchema,
  optionalText,
  paginationQuery,
  payrollCorrectionSchema,
  payrollPreviewSchema,
  reviewTimesheetSchema,
  scheduleQuery,
  stockAdjustmentSchema,
  timesheetListQuery,
  updateMaterialSchema,
  updateUserStatusSchema,
  uuid,
} from '@hydra/shared';
import { db } from '../db/pool';
import { actorFrom, auth } from '../middleware/auth';
import { PostgresWorkforceRepository } from '../repositories/workforceRepository';
import { defineRoute } from '../routes/define';
import * as authService from '../services/authService';
import * as inventory from '../services/inventoryService';
import * as workforce from '../services/workforceService';
import { notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';

const ADMIN = ['ADMIN_OFFICE', 'ADMIN_OWNER'] as const;
const OWNER = ['ADMIN_OWNER'] as const;
const STAFF = ['EMPLOYEE', 'ADMIN_OFFICE', 'ADMIN_OWNER'] as const;

export function registerOperationsRoutes(r: Router): void {
  // ---- Inventory -------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/materials', tag: 'Inventory', summary: 'Search material catalogue', access: STAFF, query: materialListQuery },
    (_req, { query }) => inventory.listMaterials(query));

  defineRoute(r, { method: 'get', path: '/materials/:id', tag: 'Inventory', summary: 'Material item detail', access: ADMIN, params: idParam },
    (_req, { params }) => inventory.getMaterial(params.id));

  defineRoute(r, { method: 'post', path: '/materials', tag: 'Inventory', summary: 'Create a material item', access: ADMIN, body: materialSchema, status: 201 },
    (req, { body }) => inventory.createMaterial(body, actorFrom(req)));

  defineRoute(r, { method: 'patch', path: '/materials/:id', tag: 'Inventory', summary: 'Edit a material item', access: ADMIN, params: idParam, body: updateMaterialSchema },
    (req, { params, body }) => inventory.updateMaterial(params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/materials/:id/archive', tag: 'Inventory', summary: 'Archive / restore a material', access: ADMIN, params: idParam, body: z.object({ archived: z.boolean() }) },
    (req, { params, body }) => inventory.setMaterialArchived(params.id, body.archived, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/materials/:id/adjust', tag: 'Inventory', summary: 'Restock or adjust stock (audited movement)', access: ADMIN, params: idParam, body: stockAdjustmentSchema },
    (req, { params, body }) => inventory.adjustStock(auth(req), params.id, body.delta, body.reason, body.note, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/inventory/low-stock', tag: 'Inventory', summary: 'Items at or below reorder level', access: ADMIN, query: paginationQuery },
    (_req, { query }) => inventory.listMaterials({ ...query, lowStockOnly: true }));

  defineRoute(r, { method: 'get', path: '/stock-movements', tag: 'Inventory', summary: 'Stock movement ledger', access: ADMIN, query: paginationQuery.extend({ materialId: uuid.optional() }) },
    (_req, { query }) => inventory.stockMovements(query.materialId, query.page, query.pageSize));

  // ---- Schedules -----------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/schedules', tag: 'Workforce', summary: 'Calendar events (electrician → own; default today + 7 days)', access: STAFF, query: scheduleQuery },
    (req, { query }) => workforce.listSchedule(auth(req), query));

  defineRoute(r, { method: 'post', path: '/schedules', tag: 'Workforce', summary: 'Create a calendar event with conflict check', access: ADMIN, body: createScheduleSchema, status: 201 },
    (req, { body }) => workforce.createScheduleEvent(auth(req), body as Parameters<typeof workforce.createScheduleEvent>[1], actorFrom(req)));

  defineRoute(r, { method: 'delete', path: '/schedules/:id', tag: 'Workforce', summary: 'Delete a non-job calendar event', access: ADMIN, params: idParam },
    (req, { params }) => workforce.deleteScheduleEvent(params.id, actorFrom(req)));

  // ---- Timesheets ----------------------------------------------------------------------------
  defineRoute(r, { method: 'post', path: '/timesheets/clock-in', tag: 'Workforce', summary: 'Clock in (one open shift at a time)', access: ['EMPLOYEE'], body: clockInSchema, status: 201, idempotent: true },
    (req, { body }) => workforce.clockIn(auth(req), body.jobId, body.notes, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/timesheets/clock-out', tag: 'Workforce', summary: 'Clock out (hours calculated server-side)', access: ['EMPLOYEE'], body: clockOutSchema, idempotent: true },
    (req, { body }) => workforce.clockOut(auth(req), body.notes, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/timesheets/current', tag: 'Workforce', summary: 'Current shift and hours today', access: ['EMPLOYEE'] },
    (req) => workforce.currentShift(auth(req)));

  defineRoute(r, { method: 'get', path: '/timesheets', tag: 'Workforce', summary: 'Timesheets (electrician → own)', access: STAFF, query: timesheetListQuery },
    (req, { query }) => workforce.listTimesheets(auth(req), query));

  defineRoute(r, { method: 'post', path: '/timesheets/:id/review', tag: 'Workforce', summary: 'Confirm or reject a timesheet', access: ADMIN, params: idParam, body: reviewTimesheetSchema },
    (req, { params, body }) => workforce.reviewTimesheet(auth(req), params.id, body.decision, body.note, actorFrom(req)));

  // ---- Leave ---------------------------------------------------------------------------------
  defineRoute(r, { method: 'post', path: '/leave-requests', tag: 'Workforce', summary: 'Submit a leave request', access: ['EMPLOYEE'], body: leaveRequestSchema, status: 201, idempotent: true },
    (req, { body }) => workforce.requestLeave(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/leave-requests', tag: 'Workforce', summary: 'Leave requests (electrician → own)', access: STAFF,
    query: paginationQuery.extend({ status: z.enum(LEAVE_STATUSES).optional(), employeeId: uuid.optional() }) },
    (req, { query }) => workforce.listLeave(auth(req), query));

  defineRoute(r, { method: 'post', path: '/leave-requests/:id/cancel', tag: 'Workforce', summary: 'Cancel a pending/future leave request', access: STAFF, params: idParam },
    (req, { params }) => workforce.cancelLeave(auth(req), params.id, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/leave-requests/:id/decision', tag: 'Workforce', summary: 'Approve or reject leave (updates availability)', access: ADMIN, params: idParam, body: decideLeaveSchema },
    (req, { params, body }) => workforce.decideLeave(auth(req), params.id, body.decision, body.note, actorFrom(req)));

  // ---- Payroll (never visible to employees — PDF Access Control ERD) --------------------------
  defineRoute(r, { method: 'post', path: '/payroll/preview', tag: 'Payroll', summary: 'Preview payroll from confirmed timesheets', access: ADMIN, body: payrollPreviewSchema },
    (_req, { body }) => workforce.payrollPreview(body));

  defineRoute(r, { method: 'post', path: '/payroll', tag: 'Payroll', summary: 'Process payroll into DRAFT records (figures computed server-side)', access: ADMIN, body: payrollPreviewSchema, status: 201 },
    (req, { body }) => workforce.processPayroll(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/payroll', tag: 'Payroll', summary: 'Payroll records', access: ADMIN,
    query: paginationQuery.extend({ status: z.enum(PAYROLL_STATUSES).optional(), employeeId: uuid.optional() }) },
    (_req, { query }) => workforce.listPayrolls(query));

  defineRoute(r, { method: 'post', path: '/payroll/:id/approve', tag: 'Payroll', summary: 'Owner approves a draft payroll', access: OWNER, params: idParam },
    (req, { params }) => workforce.advancePayroll(auth(req), params.id, 'APPROVED', actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/payroll/:id/finalise', tag: 'Payroll', summary: 'Owner finalises payroll (immutable afterwards)', access: OWNER, params: idParam },
    (req, { params }) => workforce.advancePayroll(auth(req), params.id, 'FINALISED', actorFrom(req)));

  defineRoute(r, { method: 'delete', path: '/payroll/:id', tag: 'Payroll', summary: 'Discard a draft payroll (releases timesheets)', access: ADMIN, params: idParam },
    (req, { params }) => workforce.deleteDraftPayroll(params.id, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/payroll/:id/corrections', tag: 'Payroll', summary: 'Owner creates a linked correction for finalised payroll', access: OWNER, params: idParam, body: payrollCorrectionSchema, status: 201 },
    (req, { params, body }) => workforce.correctPayroll(auth(req), params.id, body, actorFrom(req)));

  // ---- People --------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/employees', tag: 'People', summary: 'Employees with live status', access: ADMIN, query: z.object({ search: optionalText(100) }) },
    (_req, { query }) => workforce.listEmployees(query.search));

  defineRoute(r, { method: 'get', path: '/employees/:id', tag: 'People', summary: 'Employee profile (electrician → self only, pay fields hidden)', access: STAFF, params: idParam },
    (req, { params }) => workforce.getEmployee(auth(req), params.id));

  defineRoute(r, { method: 'patch', path: '/employees/:id', tag: 'People', summary: 'Update employee details / pay rate (owner)', access: OWNER, params: idParam, body: employeeUpdateSchema },
    (req, { params, body }) => workforce.updateEmployee(params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/customers', tag: 'People', summary: 'Customers', access: ADMIN, query: paginationQuery },
    async (_req, { query }) => {
      const { items, total } = await new PostgresWorkforceRepository(db()).listCustomers({ search: query.search, limit: query.pageSize, offset: (query.page - 1) * query.pageSize });
      return paginated(items, query.page, query.pageSize, total);
    });

  defineRoute(r, { method: 'get', path: '/customers/:id', tag: 'People', summary: 'Customer detail', access: ADMIN, params: idParam },
    async (_req, { params }) => (await new PostgresWorkforceRepository(db()).customerDto(params.id)) ?? Promise.reject(notFound('Customer')));

  defineRoute(r, { method: 'get', path: '/admins', tag: 'People', summary: 'Staff accounts (admins and electricians)', access: OWNER },
    async () => {
      const { rows } = await db().query(
        `SELECT u.id, u.email, u.role, u.status, u.staff_number AS "staffNumber", u.last_login_at AS "lastLoginAt",
                COALESCE(a.first_name, e.first_name) AS "firstName", COALESCE(a.last_name, e.last_name) AS "lastName"
           FROM users u LEFT JOIN admins a ON a.user_id = u.id LEFT JOIN employees e ON e.user_id = u.id
          WHERE u.role <> 'CUSTOMER' ORDER BY u.role, "firstName"`,
      );
      return rows;
    });

  defineRoute(r, { method: 'post', path: '/admins/staff', tag: 'People', summary: 'Owner provisions a staff account', access: OWNER, body: createStaffSchema, status: 201 },
    (req, { body }) => authService.createStaff(body, actorFrom(req)));

  defineRoute(r, { method: 'patch', path: '/users/:id/status', tag: 'People', summary: 'Enable / disable an account (revokes sessions)', access: OWNER, params: idParam, body: updateUserStatusSchema },
    async (req, { params, body }) => {
      await authService.setUserStatus(params.id, body.status, body.reason, actorFrom(req));
      return { id: params.id, status: body.status };
    });
}
