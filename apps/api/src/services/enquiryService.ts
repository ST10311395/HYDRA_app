import type { ContactQueryInput, ContactQueryStatus } from '@hydra/shared';
import { db } from '../db/pool';
import { PostgresCommsRepository } from '../repositories/commsRepository';
import { PostgresContentRepository } from '../repositories/contentRepository';
import { PostgresJobRepository } from '../repositories/jobRepository';
import { PostgresUserRepository } from '../repositories/userRepository';
import type { AuthContext } from '../types/express';
import { badRequest, businessRule, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { audit, type Actor } from './auditService';
import { forgotPassword } from './authService';
import { transactional } from './events';

/** Public enquiry (PDF Story 24). Only minimal fields are stored (POPIA §6.4.2). */
export async function submitEnquiry(input: ContactQueryInput, auth: AuthContext | undefined, actor: Actor) {
  return transactional(async (tx, events) => {
    const repo = new PostgresCommsRepository(tx);
    const duplicate = await repo.findRecentDuplicate(input);
    if (duplicate) {
      // Same enquiry re-sent (double tap / retry): return the original reference, notify no one again.
      const prior = (await repo.query(duplicate))!;
      return { id: duplicate, reference: prior.reference, status: prior.status, submittedAt: prior.submittedAt };
    }
    const id = await repo.createQuery(input, { userId: auth?.userId ?? null, ip: actor.ip });
    const created = (await repo.query(id))!;
    await new PostgresUserRepository(tx).recordConsent(auth?.userId ?? null, 'CONTACT_ENQUIRY', true);
    await events.notifyAdmins({
      type: 'NEW_ENQUIRY',
      title: `${input.urgency === 'EMERGENCY' ? '🚨 ' : ''}New enquiry · ${input.name}`,
      body: `${created.reference} · ${input.sector ?? input.source.replace('_', ' ').toLowerCase()}`,
      data: { enquiryId: id, route: `/admin/enquiries/${id}` },
    });
    await audit(tx, actor, 'ENQUIRY_SUBMITTED', 'contact_query', id, { source: input.source, urgency: input.urgency });
    return { id, reference: created.reference, status: created.status, submittedAt: created.submittedAt };
  });
}

export async function listEnquiries(q: { status?: ContactQueryStatus; search?: string; page: number; pageSize: number }) {
  const { items, total } = await new PostgresCommsRepository(db()).listQueries({ ...q, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

export async function getEnquiry(id: string) {
  const q = await new PostgresCommsRepository(db()).query(id);
  if (!q) throw notFound('Enquiry');
  return q;
}

export async function updateEnquiry(auth: AuthContext, id: string, input: { status?: 'NEW' | 'IN_PROGRESS' | 'CLOSED'; adminNotes?: string; assignToMe?: boolean }, actor: Actor) {
  return transactional(async (tx) => {
    const repo = new PostgresCommsRepository(tx);
    const q = await repo.query(id, true);
    if (!q) throw notFound('Enquiry');
    if (q.status === 'CONVERTED' && input.status) throw businessRule('Converted enquiries keep their status for traceability', 'ENQUIRY_CONVERTED');
    await repo.updateQuery(id, { status: input.status, adminNotes: input.adminNotes, assignedAdminId: input.assignToMe ? (auth.adminId ?? undefined) : undefined });
    await audit(tx, actor, 'ENQUIRY_UPDATED', 'contact_query', id, { status: input.status });
    return (await repo.query(id))!;
  });
}

/**
 * ContactQuery.convertToJob() (PDF §3.2): finds the matching customer by email or provisions one,
 * creates a REQUESTED job linked back to the enquiry (source traceability), and marks it CONVERTED.
 * A newly provisioned customer receives a password-setup link (no password is ever chosen for them).
 */
export async function convertEnquiry(auth: AuthContext, id: string, input: { serviceTypeId: string; siteAddress: string; description?: string; createCustomerIfMissing: boolean }, actor: Actor) {
  let provisionedEmail: string | null = null;
  const result = await transactional(async (tx, events) => {
    const comms = new PostgresCommsRepository(tx);
    const users = new PostgresUserRepository(tx);
    const q = await comms.query(id, true);
    if (!q) throw notFound('Enquiry');
    if (q.status === 'CONVERTED') throw businessRule('This enquiry has already been converted', 'ENQUIRY_CONVERTED');
    const service = await new PostgresContentRepository(tx).getServiceType(input.serviceTypeId);
    if (!service?.isActive) throw badRequest('Selected service type is not available');
    let user = await users.findByEmail(q.email);
    if (user && user.role !== 'CUSTOMER') throw businessRule('The enquiry email belongs to a staff account', 'EMAIL_IS_STAFF');
    if (!user) {
      if (!input.createCustomerIfMissing) throw businessRule('No customer account matches this enquiry', 'CUSTOMER_NOT_FOUND');
      const [first, ...rest] = q.name.split(' ');
      const userId = await users.create({ email: q.email, passwordHash: null, role: 'CUSTOMER' });
      await users.createCustomerProfile(userId, { firstName: first ?? q.name, lastName: rest.join(' '), phone: q.phone, address: input.siteAddress, marketingOptIn: false });
      user = (await users.findById(userId))!;
      provisionedEmail = q.email;
      await audit(tx, actor, 'CUSTOMER_PROVISIONED_FROM_ENQUIRY', 'user', userId, { enquiryId: id });
    }
    const jobs = new PostgresJobRepository(tx);
    const jobId = await jobs.insert({
      customerId: user.customerId!,
      serviceTypeId: input.serviceTypeId,
      siteAddress: input.siteAddress,
      description: input.description ?? q.message,
      urgency: q.urgency,
      source: 'CONTACT_QUERY',
      contactPhone: q.phone,
      contactQueryId: id,
    });
    await jobs.createMilestones(jobId);
    await jobs.completeMilestonesByCode(jobId, ['REQUESTED'], auth.userId);
    await jobs.recordStatusHistory(jobId, null, 'REQUESTED', 'CONVERT_ENQUIRY', auth.userId, q.reference);
    await comms.updateQuery(id, { status: 'CONVERTED', convertedJobId: jobId, convertedCustomerId: user.customerId!, assignedAdminId: auth.adminId ?? undefined });
    const job = (await jobs.findById(jobId))!;
    await events.notify([user.id], { type: 'NEW_JOB_REQUEST', title: `Service request ${job.reference} created`, body: `We've logged your enquiry ${q.reference} as a service request. A quote will follow.`, data: { jobId } });
    events.emit('admins', 'job.updated', { jobId, status: 'REQUESTED' });
    await audit(tx, actor, 'ENQUIRY_CONVERTED', 'contact_query', id, { jobId, customerId: user.customerId });
    return { enquiry: (await comms.query(id))!, jobId, jobReference: job.reference, customerProvisioned: provisionedEmail !== null };
  });
  if (provisionedEmail) await forgotPassword(provisionedEmail, actor);
  return result;
}

export async function enquiryKpi(): Promise<number> {
  return new PostgresCommsRepository(db()).newQueryCount();
}
