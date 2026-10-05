import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@hydra/shared';
import { createApp } from '../src/app';
import { db } from '../src/db/pool';
import { overrideAiProvider } from '../src/ai/providers';
import { overrideIntegrations } from '../src/integrations';
import type { GoogleIdentity, GoogleIdentityVerifier } from '../src/integrations/google';
import { PostgresUserRepository } from '../src/repositories/userRepository';
import { hashPassword } from '../src/services/authService';
import { addDays, todayIso } from '../src/utils/dates';
import { unauthorized } from '../src/utils/errors';

export const PASSWORD = 'correct-horse-battery-staple';
export const API = '/api/v1';

let app: Express | null = null;
export function getApp(): Express {
  app ??= createApp();
  return app;
}

/** Fake Google verifier: tokens of the form `google:<sub>:<email>` verify successfully. */
export class FakeGoogleVerifier implements GoogleIdentityVerifier {
  readonly configured = true;
  async verify(idToken: string): Promise<GoogleIdentity> {
    const [prefix, subject, email] = idToken.split('|');
    if (prefix !== 'google-test-token' || !subject || !email) {
      throw unauthorized('Google sign-in could not be verified');
    }
    return { subject, email, emailVerified: true, givenName: 'Gugu', familyName: 'Tester' };
  }
}

export const googleToken = (sub: string, email: string) => `google-test-token|${sub}|${email}|padding-to-satisfy-min-length`;

const TABLES = [
  'ai_estimate_outcomes', 'ai_provider_calls', 'ai_knowledge_revisions', 'ai_knowledge_entries', 'ai_feedback', 'ai_admin_reviews',
  'ai_proposals', 'ai_attachments', 'ai_messages', 'ai_assessments', 'ai_conversations', 'ai_policies',
  'audit_logs', 'data_export_logs', 'idempotency_keys', 'notifications', 'push_tokens', 'ai_message_logs', 'missed_call_logs', 'contacts',
  'payroll_items', 'payrolls', 'timesheets', 'employee_schedules', 'leave_requests', 'customer_discounts', 'discounts', 'rewards_transactions',
  'rewards_accounts', 'payment_webhook_events', 'payments', 'invoice_items', 'invoices', 'inspection_attachments', 'inspection_reports',
  'stock_movements', 'job_materials', 'materials', 'quote_items', 'quotes', 'job_attachments', 'job_notes', 'job_checkins', 'job_qr_tokens',
  'job_milestones', 'job_status_history', 'job_assignments', 'contact_queries', 'jobs', 'files', 'department_contacts', 'offices',
  'team_members', 'partners', 'faqs', 'portfolio_items', 'service_types', 'data_subject_requests', 'consents', 'push_tokens',
  'login_attempts', 'password_reset_tokens', 'refresh_tokens', 'auth_identities', 'admins', 'employees', 'customers', 'users',
];

export interface Fixture {
  users: Record<'customerA' | 'customerB' | 'electrician1' | 'electrician2' | 'office' | 'owner', { id: string; email: string; staffNumber: string | null; customerId: string | null; employeeId: string | null }>;
  serviceTypeId: string;
  materials: { cable: string; breaker: string; scarce: string };
}

export async function resetDatabase(): Promise<Fixture> {
  // audit_logs is append-only by trigger; the trigger is disabled only for test cleanup.
  await db().query('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update');
  await db().query('ALTER TABLE payrolls DISABLE TRIGGER payrolls_protect');
  await db().query(`TRUNCATE ${[...new Set(TABLES)].join(', ')} RESTART IDENTITY CASCADE`);
  await db().query('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update');
  await db().query('ALTER TABLE payrolls ENABLE TRIGGER payrolls_protect');
  await db().query(`UPDATE app_settings SET value = 'false' WHERE key = 'missedCallAutomationEnabled'`);
  await db().query(`UPDATE app_settings SET value = 'true' WHERE key = 'payrollRequirePaidInvoice'`);
  overrideIntegrations({ google: new FakeGoogleVerifier() });
  overrideAiProvider(null);

  const hash = await hashPassword(PASSWORD);
  const users = new PostgresUserRepository(db());
  const make = async (role: Role, email: string, first: string) => {
    const staffNumber = role === 'CUSTOMER' ? null : await users.nextStaffNumber(role);
    const id = await users.create({ email, passwordHash: hash, role, staffNumber });
    if (role === 'CUSTOMER') await users.createCustomerProfile(id, { firstName: first, lastName: 'Test', phone: '+27 82 000 0001', address: '1 Test Road', marketingOptIn: false });
    else if (role === 'EMPLOYEE') await users.createEmployeeProfile(id, { firstName: first, lastName: 'Sparky', phone: '+27 82 000 0002', certificationNo: 'CERT-1', specialisation: 'General', hourlyRate: 200, taxRate: 0.1 });
    else await users.createAdminProfile(id, { firstName: first, lastName: 'Admin', phone: '+27 82 000 0003' });
    const u = (await users.findById(id))!;
    return { id, email, staffNumber: u.staffNumber, customerId: u.customerId, employeeId: u.employeeId };
  };
  const fixture: Fixture = {
    users: {
      customerA: await make('CUSTOMER', 'alice@test.local', 'Alice'),
      customerB: await make('CUSTOMER', 'bob@test.local', 'Bob'),
      electrician1: await make('EMPLOYEE', 'sparky1@test.local', 'Sam'),
      electrician2: await make('EMPLOYEE', 'sparky2@test.local', 'Lee'),
      office: await make('ADMIN_OFFICE', 'office@test.local', 'Olive'),
      owner: await make('ADMIN_OWNER', 'owner@test.local', 'Owen'),
    },
    serviceTypeId: (await db().query<{ id: string }>(
      `INSERT INTO service_types (slug, name, category, description, base_price) VALUES ('coc','CoC & Audits','COMPLIANCE','Compliance inspections',1850) RETURNING id`,
    )).rows[0]!.id,
    materials: {
      cable: (await db().query<{ id: string }>(`INSERT INTO materials (sku,name,unit,unit_cost,stock_level,reorder_level) VALUES ('C1','Cable 2.5mm','m',10.5,100,20) RETURNING id`)).rows[0]!.id,
      breaker: (await db().query<{ id: string }>(`INSERT INTO materials (sku,name,unit,unit_cost,stock_level,reorder_level) VALUES ('B1','Breaker 20A','each',89.9,10,5) RETURNING id`)).rows[0]!.id,
      scarce: (await db().query<{ id: string }>(`INSERT INTO materials (sku,name,unit,unit_cost,stock_level,reorder_level) VALUES ('S1','Surge arrester','each',1480,2,3) RETURNING id`)).rows[0]!.id,
    },
  };
  return fixture;
}

export async function login(identifier: string, password = PASSWORD): Promise<{ token: string; refreshToken: string }> {
  const res = await request(getApp()).post(`${API}/auth/login`).send({ identifier, password });
  if (res.status !== 200) throw new Error(`login failed for ${identifier}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken };
}

export function api(token?: string) {
  const agent = request(getApp());
  const withAuth = <T extends { set: (k: string, v: string) => T }>(r: T) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (url: string) => withAuth(agent.get(`${API}${url}`)),
    post: (url: string, body?: object) => withAuth(agent.post(`${API}${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => withAuth(agent.patch(`${API}${url}`)).send(body ?? {}),
    delete: (url: string, body?: object) => withAuth(agent.delete(`${API}${url}`)).send(body ?? {}),
  };
}

export interface Tokens {
  customerA: string;
  customerB: string;
  electrician1: string;
  electrician2: string;
  office: string;
  owner: string;
}

export async function loginAll(f: Fixture): Promise<Tokens> {
  return {
    customerA: (await login(f.users.customerA.email)).token,
    customerB: (await login(f.users.customerB.email)).token,
    electrician1: (await login(f.users.electrician1.staffNumber!)).token,
    electrician2: (await login(f.users.electrician2.staffNumber!)).token,
    office: (await login(f.users.office.email)).token,
    owner: (await login(f.users.owner.email)).token,
  };
}

let slot = 0;

export const SITE = { latitude: -29.72, longitude: 31.06, accuracy: 10 };
export const CHECKLIST = [
  { key: 'earth', label: 'Earth continuity', result: 'PASS', reading: '0.2Ω' },
  { key: 'elu', label: 'ELU trip test', result: 'PASS' },
];

export function window(daysFromToday: number, hour = 9, hours = 2) {
  const start = new Date(`${addDays(todayIso(), daysFromToday)}T${String(hour - 2).padStart(2, '0')}:00:00Z`);
  return { scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + hours * 3_600_000).toISOString() };
}

/** Drives a job through the API to the requested milestone; returns ids needed by later steps. */
export async function driveJob(
  f: Fixture,
  t: Tokens,
  until: 'REQUESTED' | 'QUOTED' | 'QUOTE_ACCEPTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'INSPECTION_PENDING' | 'COMPLETED' | 'INVOICED',
  opts: { customer?: 'customerA' | 'customerB'; electrician?: 'electrician1' | 'electrician2'; day?: number } = {},
) {
  const customer = opts.customer ?? 'customerA';
  const electrician = opts.electrician ?? 'electrician1';
  const order = ['REQUESTED', 'QUOTED', 'QUOTE_ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'INSPECTION_PENDING', 'COMPLETED', 'INVOICED'];
  const reach = (s: string) => order.indexOf(until) >= order.indexOf(s);
  const out: { jobId: string; quoteId?: string; invoiceId?: string } = { jobId: '' };
  const job = await api(t[customer]).post('/jobs', {
    serviceTypeId: f.serviceTypeId, siteAddress: '1 Test Road, Durban', description: 'Please inspect the distribution board', contactConfirmed: true, siteLocation: SITE,
  });
  if (job.status !== 201) throw new Error(JSON.stringify(job.body));
  out.jobId = job.body.id;
  if (!reach('QUOTED')) return out;
  const quote = await api(t.office).post(`/jobs/${out.jobId}/quote`, {
    items: [{ kind: 'LABOUR', description: 'Labour', quantity: 2, unitPrice: 500 }, { kind: 'MATERIAL', description: 'Breaker', quantity: 1, unitPrice: 100 }],
    validUntil: addDays(todayIso(), 10),
  });
  if (quote.status !== 201) throw new Error(JSON.stringify(quote.body));
  out.quoteId = quote.body.id;
  if (!reach('QUOTE_ACCEPTED')) return out;
  await api(t[customer]).post(`/quotes/${out.quoteId}/accept`).expect(200);
  if (!reach('SCHEDULED')) return out;
  const assign = await api(t.office).post(`/jobs/${out.jobId}/assign`, { employeeId: f.users[electrician].employeeId, ...window(opts.day ?? 0, 8 + (slot++ % 10)), overrideConflicts: true });
  if (assign.status !== 200) throw new Error(JSON.stringify(assign.body));
  if (!reach('IN_PROGRESS')) return out;
  const qr = await api(t[customer]).get(`/jobs/${out.jobId}/qr`).expect(200);
  const ci = await api(t[electrician]).post(`/jobs/${out.jobId}/checkin`, { qrToken: qr.body.payload, location: SITE });
  if (ci.status !== 200) throw new Error(JSON.stringify(ci.body));
  if (!reach('INSPECTION_PENDING')) return out;
  await api(t[electrician]).post(`/jobs/${out.jobId}/complete`, { summary: 'Done' }).expect(200);
  if (!reach('COMPLETED')) return out;
  const insp = await api(t[electrician]).post(`/jobs/${out.jobId}/inspection`, {
    complianceStatus: 'PASS', certificateNumber: `COC-${out.jobId.slice(0, 8)}`, findings: 'All good and compliant', checklist: CHECKLIST, signatureName: 'Sam Sparky', confirmed: true,
  });
  if (insp.status !== 201) throw new Error(JSON.stringify(insp.body));
  if (!reach('INVOICED')) return out;
  const inv = await api(t.office).post(`/jobs/${out.jobId}/invoice`, { dueDate: addDays(todayIso(), 14) });
  if (inv.status !== 201) throw new Error(JSON.stringify(inv.body));
  out.invoiceId = inv.body.id;
  return out;
}
