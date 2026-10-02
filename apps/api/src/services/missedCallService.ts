import { JOB_STATUS_LABELS, type MessageChannel, type MissedCallInput, type MissedCallStatus } from '@hydra/shared';
import { db, type Queryable } from '../db/pool';
import { integrations } from '../integrations';
import { PostgresCommsRepository } from '../repositories/commsRepository';
import { PostgresSettingsRepository } from '../repositories/settingsRepository';
import { PostgresUserRepository } from '../repositories/userRepository';
import type { AuthContext } from '../types/express';
import { maskPhone, toE164 } from '../utils/crypto';
import { businessRule, conflict, forbidden, notFound } from '../utils/errors';
import { paginated } from '../utils/pagination';
import { audit, type Actor } from './auditService';
import { transactional, type EventCollector } from './events';

export type Classification = 'OPEN_JOB_STATUS' | 'KNOWN_CUSTOMER' | 'UNKNOWN_CALLER';

interface CallerContext {
  customerId: string | null;
  firstName: string | null;
  openJob: { reference: string; status: keyof typeof JOB_STATUS_LABELS } | null;
}

/** Looks up only what is needed to route a reply (PDF Fig. 13 ContactIdentified — data minimisation). */
async function identifyCaller(q: Queryable, phoneE164: string): Promise<CallerContext> {
  const digits = phoneE164.replace(/\D/g, '').slice(-9);
  const { rows } = await q.query<{ customerId: string; firstName: string; reference: string | null; status: string | null }>(
    `SELECT c.id AS "customerId", c.first_name AS "firstName", j.reference, j.status
       FROM customers c
       LEFT JOIN LATERAL (SELECT reference, status FROM jobs WHERE customer_id = c.id AND status NOT IN ('PAID','CANCELLED')
                          ORDER BY updated_at DESC LIMIT 1) j ON true
      WHERE right(regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g'), 9) = $1
      LIMIT 1`,
    [digits],
  );
  const r = rows[0];
  if (!r) return { customerId: null, firstName: null, openJob: null };
  return { customerId: r.customerId, firstName: r.firstName, openJob: r.reference ? { reference: r.reference, status: r.status as keyof typeof JOB_STATUS_LABELS } : null };
}

/**
 * Rule-based classification with a human-in-the-loop fallback (PDF Fig. 13): only confidently
 * routine cases are auto-replied; unknown callers go to admin review with a suggested reply.
 */
export function classify(ctx: CallerContext, template: string): { classification: Classification; auto: boolean; message: string } {
  const name = ctx.firstName ? ` ${ctx.firstName}` : '';
  if (ctx.openJob) {
    return {
      classification: 'OPEN_JOB_STATUS',
      auto: true,
      message: `Hi${name}, sorry we missed your call. Your job ${ctx.openJob.reference} is currently "${JOB_STATUS_LABELS[ctx.openJob.status]}" — track it live in the PSG Electrical app. We'll call you back shortly.`,
    };
  }
  const base = template.replace('{{name}}', name);
  if (ctx.customerId) return { classification: 'KNOWN_CUSTOMER', auto: true, message: base };
  return { classification: 'UNKNOWN_CALLER', auto: false, message: base };
}

async function sendAndLog(q: Queryable, events: EventCollector, missedCallId: string, channel: MessageChannel, to: string, message: string, approvedBy: string | null): Promise<'SENT' | 'FAILED' | 'NOT_CONFIGURED'> {
  const provider = integrations().messaging[channel];
  const res = await provider.send(to, message);
  await new PostgresCommsRepository(q).logMessage({
    missedCallId,
    channel,
    recipient: to,
    content: message,
    status: res.status,
    provider: res.provider,
    providerMessageId: res.providerMessageId,
    error: res.error,
    approvedBy,
  });
  if (res.status === 'FAILED') {
    await events.notifyAdmins({ type: 'MESSAGE_FAILED', title: 'Automated message failed', body: `${channel} to ${maskPhone(to)}: ${res.error ?? 'delivery failed'}`, data: { missedCallId, route: '/admin/missed-calls' } });
  }
  return res.status === 'SENT' || res.status === 'DELIVERED' ? 'SENT' : res.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : 'FAILED';
}

/**
 * Logs a missed call from the admin work device (Android monitor) or a manual entry and runs the
 * automated response workflow. Device-sourced logs require the feature flag AND the admin's
 * recorded consent (POPIA §6.4.10). No address book or call content is ever uploaded.
 */
export async function logMissedCall(auth: AuthContext, input: MissedCallInput, actor: Actor) {
  const settings = await new PostgresSettingsRepository(db()).getAll();
  if (input.source === 'DEVICE_MONITOR') {
    if (!settings.missedCallAutomationEnabled) throw forbidden('Missed-call monitoring is disabled by the administrator');
    const { rows } = await db().query<{ granted: boolean }>(
      `SELECT granted FROM consents WHERE user_id = $1 AND consent_type = 'MISSED_CALL_MONITORING' ORDER BY created_at DESC LIMIT 1`,
      [auth.userId],
    );
    if (!rows[0]?.granted) throw forbidden('Missed-call monitoring consent has not been given on this account');
  }
  const phone = toE164(input.phoneNumber);
  return transactional(async (tx, events) => {
    const comms = new PostgresCommsRepository(tx);
    const ctx = await identifyCaller(tx, phone);
    const contactId = await comms.upsertContact({ phone, name: ctx.firstName, email: null, source: 'INBOUND_CALL', linkedCustomerId: ctx.customerId });
    const id = await comms.createMissedCall({ contactId, callAt: input.callAt, durationSeconds: input.durationSeconds, source: input.source, deviceId: input.deviceId, reportedBy: auth.userId });
    if (!id) throw conflict('This missed call has already been logged', 'DUPLICATE_MISSED_CALL');
    const decision = classify(ctx, settings.missedCallAutoReplyTemplate);
    let status: MissedCallStatus = 'REVIEW_REQUIRED';
    if (decision.auto && settings.missedCallAutomationEnabled) {
      const sent = await sendAndLog(tx, events, id, settings.missedCallDefaultChannel, phone, decision.message, null);
      status = sent === 'SENT' ? 'AUTO_REPLIED' : sent === 'FAILED' ? 'FAILED' : 'REVIEW_REQUIRED';
    }
    await comms.updateMissedCall(id, { status, classification: decision.classification, suggestedReply: decision.message });
    if (status !== 'AUTO_REPLIED') {
      await events.notifyAdmins({ type: 'MISSED_CALL_REVIEW', title: 'Missed call needs review', body: `${maskPhone(phone)} · ${decision.classification.replace(/_/g, ' ').toLowerCase()}`, data: { missedCallId: id, route: '/admin/missed-calls' } });
    }
    await audit(tx, actor, 'MISSED_CALL_LOGGED', 'missed_call', id, { source: input.source, classification: decision.classification, status, phone: maskPhone(phone) });
    return (await comms.missedCall(id))!;
  });
}

export async function replyToMissedCall(auth: AuthContext, id: string, message: string, channel: MessageChannel, actor: Actor) {
  return transactional(async (tx, events) => {
    const comms = new PostgresCommsRepository(tx);
    const mc = await comms.missedCall(id, true);
    if (!mc) throw notFound('Missed call');
    if (mc.status === 'DISMISSED') throw businessRule('This missed call was dismissed');
    const sent = await sendAndLog(tx, events, id, channel, mc.phoneNumber, message, auth.userId);
    await comms.updateMissedCall(id, { status: sent === 'SENT' ? 'REPLIED' : sent === 'FAILED' ? 'FAILED' : 'REVIEW_REQUIRED' });
    await audit(tx, actor, 'MISSED_CALL_REPLY', 'missed_call', id, { channel, delivery: sent });
    return { missedCall: (await comms.missedCall(id))!, delivery: sent };
  });
}

export async function dismissMissedCall(id: string, reason: string | undefined, actor: Actor) {
  return transactional(async (tx) => {
    const comms = new PostgresCommsRepository(tx);
    if (!(await comms.missedCall(id, true))) throw notFound('Missed call');
    await comms.updateMissedCall(id, { status: 'DISMISSED' });
    await audit(tx, actor, 'MISSED_CALL_DISMISSED', 'missed_call', id, { reason });
    return (await comms.missedCall(id))!;
  });
}

export async function listMissedCalls(q: { status?: MissedCallStatus; page: number; pageSize: number }) {
  const { items, total } = await new PostgresCommsRepository(db()).listMissedCalls({ status: q.status, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

export async function getMissedCall(id: string) {
  const mc = await new PostgresCommsRepository(db()).missedCall(id);
  if (!mc) throw notFound('Missed call');
  return mc;
}

export async function listMessageLogs(q: { page: number; pageSize: number }) {
  const { items, total } = await new PostgresCommsRepository(db()).listMessages({ limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
  return paginated(items, q.page, q.pageSize, total);
}

export async function setMonitoringConsent(auth: AuthContext, granted: boolean, actor: Actor) {
  await new PostgresUserRepository(db()).recordConsent(auth.userId, 'MISSED_CALL_MONITORING', granted);
  await audit(db(), actor, granted ? 'MISSED_CALL_CONSENT_GRANTED' : 'MISSED_CALL_CONSENT_WITHDRAWN', 'user', auth.userId);
  return { granted };
}

export async function monitoringStatus(auth: AuthContext) {
  const settings = await new PostgresSettingsRepository(db()).getAll();
  const { rows } = await db().query<{ granted: boolean }>(
    `SELECT granted FROM consents WHERE user_id = $1 AND consent_type = 'MISSED_CALL_MONITORING' ORDER BY created_at DESC LIMIT 1`,
    [auth.userId],
  );
  return {
    featureEnabled: settings.missedCallAutomationEnabled,
    consentGranted: rows[0]?.granted ?? false,
    smsConfigured: integrations().messaging.SMS.configured,
    whatsappConfigured: integrations().messaging.WHATSAPP.configured,
  };
}
