/**
 * HYDRA Smart Quote — API, workflow, security, failure-handling and learning tests (docs/AI_ASSISTANT.md).
 * Runs against the real PostgreSQL test database with the deterministic development provider.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../src/ai/policies';
import { overrideAiProvider } from '../src/ai/providers';
import { AiProviderError, type AiProvider } from '../src/ai/providers/types';
import { closePool, db } from '../src/db/pool';
import { PostgresUserRepository } from '../src/repositories/userRepository';
import { seedSmartQuote } from '../seeds/ai';
import { API, api, getApp, loginAll, resetDatabase, type Fixture, type Tokens } from './helpers';

let f: Fixture;
let t: Tokens;
let faultServiceId: string;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b30000000049454e44ae426082', 'hex');
let keySeq = 0;
const key = () => `ai-test-key-${Date.now().toString(36)}-${keySeq++}`;

function post(token: string, url: string, body: object, idem?: string) {
  const r = request(getApp()).post(`${API}${url}`).set('Authorization', `Bearer ${token}`);
  return (idem ? r.set('Idempotency-Key', idem) : r).send(body);
}

async function uploadAiPhoto(token: string) {
  const res = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${token}`).field('purpose', 'AI_ASSESSMENT_PHOTO').attach('file', PNG, { filename: 'db-board.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function start(token: string, message: string, extra: object = {}) {
  const res = await post(token, '/ai/conversations', { message, ...extra }, key());
  if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function setSettings(patch: Partial<typeof DEFAULT_AI_SETTINGS>) {
  const cur = await api(t.owner).get('/ai/settings').expect(200);
  await request(getApp()).put(`${API}/ai/settings`).set('Authorization', `Bearer ${t.owner}`).send({ settings: { ...cur.body.settings, ...patch }, changeNote: 'test' }).expect(200);
}

const notifications = async (userId: string, type: string) =>
  (await db().query<{ title: string; data: Record<string, string> }>('SELECT title, data FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at', [userId, type])).rows;

beforeAll(async () => {
  f = await resetDatabase();
  t = await loginAll(f);
  faultServiceId = (await db().query<{ id: string }>(
    `INSERT INTO service_types (slug, name, category, description, base_price) VALUES ('emergency-repairs-diagnostics','Emergency Repairs & Diagnostics','EMERGENCY','Fault finding',1450) RETURNING id`,
  )).rows[0]!.id;
});
afterEach(() => overrideAiProvider(null));
afterAll(async () => {
  await closePool();
});

describe('customer Smart Quote workflow', () => {
  let caseId = '';
  let photoId = '';

  it('reports availability and labels the development simulation', async () => {
    const res = await api(t.customerA).get('/ai/status').expect(200);
    expect(res.body).toMatchObject({ enabled: true, simulation: true, simulationLabel: 'Development AI simulation' });
    expect(res.body.disclaimer).toMatch(/not a final electrical diagnosis or binding quotation/);
  });

  it('starts an assessment with a photo and asks a limited number of useful clarifying questions', async () => {
    photoId = await uploadAiPhoto(t.customerA);
    const c = await start(t.customerA, 'My DB trips whenever I turn my geyser on.', { attachmentIds: [photoId], propertyType: 'RESIDENTIAL' });
    caseId = c.id;
    expect(c.reference).toMatch(/^AIQ-\d{6}$/);
    expect(c.status).toBe('NEEDS_INFORMATION');
    expect(c.isSimulation).toBe(true);
    const last = c.messages.at(-1);
    expect(last.kind).toBe('CLARIFICATION');
    expect(last.questions.length).toBeGreaterThan(0);
    expect(last.questions.length).toBeLessThanOrEqual(3);
    expect(last.authorLabel).toMatch(/Development AI simulation/);
    expect(c.messages[0].attachments).toHaveLength(1);
    // The mock provider never pretends to have looked at the photo.
    expect(c.messages[0].attachments[0].analysisStatus).toBe('UNAVAILABLE');
    expect(c.assessment).toBeNull();
    expect(c.proposal).toBeNull();
  });

  it('produces a structured preliminary assessment and proposal after the customer answers', async () => {
    const res = await post(t.customerA, `/ai/conversations/${caseId}/messages`, { body: 'Only the geyser circuit trips. No burning smell or damage, and no recent electrical work.' }, key()).expect(200);
    const c = res.body;
    expect(c.status).toBe('AI_ANSWERED');
    expect(c.assessment).toMatchObject({ serviceCategory: 'FAULT_FINDING', serviceCategoryLabel: 'Electrical fault finding', severity: 3, severityName: 'High', outcome: 'PROPOSAL' });
    expect(c.assessment.confidence).toBeGreaterThanOrEqual(80);
    expect(c.assessment.response.wording).toMatch(/subject to technician availability/);
    expect(c.assessment.safetyFlags).toEqual([]); // "No burning smell" is negated, not a trigger
    expect(c.proposal.status).toBe('SENT');
    expect(c.proposal.priceMin).toBeGreaterThan(0);
    expect(c.proposal.priceMax).toBeGreaterThanOrEqual(c.proposal.priceMin);
    expect(c.assessment.estimate.basis.length).toBeGreaterThan(2);
    expect(c.notices.estimateNotice).toBe('Preliminary estimate only. Final pricing may change following on-site inspection.');
    expect(c.can.accept).toBe(true);
    const row = (await db().query('SELECT ai_inputs, est_min, admin_price_min, prompt_version, pricing_policy_version, severity_policy_version, provider FROM ai_assessments WHERE conversation_id = $1 ORDER BY version DESC LIMIT 1', [caseId])).rows[0]!;
    // AI-suggested inputs, system price and admin price are stored separately, with versions.
    expect(row.ai_inputs.labourHours).toBeTruthy();
    expect(Number(row.est_min)).toBe(c.proposal.priceMin);
    expect(row.admin_price_min).toBeNull();
    expect(row).toMatchObject({ provider: 'mock', pricing_policy_version: 1, severity_policy_version: 1 });
    expect(row.prompt_version).toMatch(/^smartquote-/);
  });

  it('accepting the proposal creates a REQUESTED job through the normal workflow (idempotent)', async () => {
    const k = key();
    const body = { siteAddress: '12 Main Road, Durban North', confirm: true };
    const first = await post(t.customerA, `/ai/conversations/${caseId}/accept`, body, k).expect(200);
    expect(first.body.status).toBe('CONVERTED_TO_JOB');
    expect(first.body.jobReference).toMatch(/^HYD-/);
    const replay = await post(t.customerA, `/ai/conversations/${caseId}/accept`, body, k).expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    await post(t.customerA, `/ai/conversations/${caseId}/accept`, body, key()).expect(200); // a fresh retry is also safe
    const jobs = (await db().query('SELECT id, status, source, urgency, ai_conversation_id FROM jobs WHERE ai_conversation_id = $1', [caseId])).rows;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'REQUESTED', source: 'AI_ASSESSMENT', urgency: 'HIGH' });
    const job = await api(t.customerA).get(`/jobs/${jobs[0]!.id}`).expect(200);
    expect(job.body.attachments.map((a: { id: string }) => a.id)).toContain(photoId);
    const adminNote = await notifications(f.users.office.id, 'NEW_JOB_REQUEST');
    expect(adminNote.at(-1)?.title).toMatch(/Customer accepted AI preliminary proposal/);
    const ai = await api(t.customerA).get(`/jobs/${jobs[0]!.id}/ai-assessment`).expect(200);
    expect(ai.body.assessment.estimate).toBeTruthy();
  });

  it('keeps history across sign-ins and lists it for the customer only', async () => {
    const list = await api(t.customerA).get('/ai/conversations').expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toContain(caseId);
    const other = await api(t.customerB).get('/ai/conversations').expect(200);
    expect(other.body.items).toHaveLength(0);
  });

  it('only accepts customer feedback after the service is completed', async () => {
    const res = await post(t.customerA, `/ai/conversations/${caseId}/feedback`, { helpful: 'YES' }).expect(422);
    expect(res.body.error.code).toBe('AI_FEEDBACK_TOO_EARLY');
  });

  it('declining closes the case', async () => {
    await post(t.customerA, '/ai/conversations', { message: 'The light in my lounge flickers sometimes [mock:confident]' }, key()).expect(201);
    const list = await api(t.customerA).get('/ai/conversations').expect(200);
    const id = list.body.items.find((c: { title: string }) => c.title.startsWith('The light in my lounge')).id;
    const res = await post(t.customerA, `/ai/conversations/${id}/decline`, { reason: 'Too expensive' }, key()).expect(200);
    expect(res.body.status).toBe('CLOSED');
    expect(res.body.proposal.status).toBe('DECLINED');
    await post(t.customerA, `/ai/conversations/${id}/messages`, { body: 'hello?' }, key()).expect(422);
  });
});

describe('safety, severity and escalation', () => {
  it('severity 5: strong safety warning, no quotation, critical admin alert', async () => {
    const c = await start(t.customerB, 'There is smoke coming out of my distribution board and a burning smell!');
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(c.severity).toBe(5);
    expect(c.safetyWarning).toMatch(/Do not touch damaged electrical equipment/);
    expect(c.messages.at(-1).kind).toBe('SAFETY_WARNING');
    expect(c.proposal).toBeNull();
    expect(c.assessment.estimate).toBeNull();
    expect(c.assessment.outcome).toBe('SAFETY_ESCALATION');
    const alerts = await notifications(f.users.owner.id, 'AI_CASE_CRITICAL');
    expect(alerts.at(-1)?.title).toMatch(/CRITICAL/);
    const detail = await api(t.office).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.assessment.ruleSeverityFloor).toBe(5);
    expect(detail.body.assessment.safetyTriggers.map((x: { code: string }) => x.code)).toEqual(expect.arrayContaining(['SMOKE', 'BURNING_SMELL']));
    expect(detail.body.escalationReasons).toEqual(expect.arrayContaining(['CRITICAL_SAFETY', 'SAFETY_TRIGGER']));
  });

  it('severity 4 is escalated to admin without an automatic proposal', async () => {
    const c = await start(t.customerB, 'My wall plug was sparking when I plugged in the kettle [mock:confident]');
    expect(c.severity).toBe(4);
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(c.proposal).toBeNull();
    expect(c.messages.at(-1).body).toMatch(/team/);
    expect(c.messages.at(-1).body).not.toMatch(/replace|rewire|unscrew/i);
  });

  it('server rules override a lower AI severity', async () => {
    const lowballer: AiProvider = {
      name: 'scripted', model: 'test', configured: true, simulation: false, supportsImages: false,
      analyseCase: async () => JSON.stringify({ summary: 'Minor issue', serviceCategory: 'LIGHTING', severity: 1, confidence: 95, imageFindings: { status: 'NOT_PROVIDED', notes: [] } }),
    };
    overrideAiProvider(lowballer);
    const c = await start(t.customerB, 'My light switch is melted and very hot');
    const detail = await api(t.office).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.assessment.aiSeverity).toBe(1);
    expect(detail.body.assessment.severity).toBe(4);
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
  });

  it('removes DIY instructions from AI output and escalates', async () => {
    overrideAiProvider({
      name: 'scripted', model: 'test', configured: true, simulation: false, supportsImages: false,
      analyseCase: async () => JSON.stringify({ summary: 'Socket faulty. You can replace the socket yourself after switching off the breaker.', serviceCategory: 'SOCKETS_SWITCHES', severity: 2, confidence: 92 }),
    });
    const c = await start(t.customerB, 'One plug point in the kitchen is dead');
    const detail = await api(t.office).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.assessment.summary).toBe('Socket faulty.');
    expect(detail.body.escalationReasons).toContain('UNSAFE_AI_OUTPUT');
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
  });

  it('a customer can always ask for a person', async () => {
    const c = await start(t.customerB, 'Inverter shows an error code on the screen');
    const res = await post(t.customerB, `/ai/conversations/${c.id}/request-review`, { note: 'Please call me' }, key()).expect(200);
    expect(res.body.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(res.body.pendingReview).toBe(true);
    const alerts = await notifications(f.users.office.id, 'AI_CASE_REVIEW');
    expect(alerts.at(-1)?.title).toMatch(/Customer asked for a person/);
  });

  it('stops asking questions at the configured limit', async () => {
    await setSettings({ maxClarificationRounds: 0 });
    const c = await start(t.customerB, 'My DB trips at night');
    expect(c.status).not.toBe('NEEDS_INFORMATION');
    expect(c.assessment).not.toBeNull();
    await setSettings({ maxClarificationRounds: 3 });
  });
});

describe('provider failure handling (the enquiry is never lost)', () => {
  it('timeouts / errors: saves the enquiry, retries once, routes to admin', async () => {
    let calls = 0;
    overrideAiProvider({
      name: 'flaky', model: 'test', configured: true, simulation: false, supportsImages: false,
      analyseCase: async () => {
        calls++;
        throw new AiProviderError('RATE_LIMITED', 'busy');
      },
    });
    const c = await start(t.customerA, 'Our office lost power on half the circuits');
    expect(calls).toBe(2); // 1 retry (AI_MAX_RETRIES=1)
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(c.messages.at(-1).body).toBe('Your request has been saved and sent to our team for review.');
    const detail = await api(t.owner).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.escalationReasons).toContain('PROVIDER_UNAVAILABLE');
    expect(detail.body.providerCalls.map((p: { status: string }) => p.status)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    expect(detail.body.assessment.source).toBe('FALLBACK');
  });

  it('hard timeout is enforced', async () => {
    const c = await start(t.customerA, 'Geyser not heating [mock:timeout]');
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
    const detail = await api(t.owner).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.providerCalls[0].status).toBe('TIMEOUT');
  }, 20_000);

  it('malformed AI output is rejected, not shown', async () => {
    const c = await start(t.customerA, 'Lights flicker in the kitchen [mock:malformed]');
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(c.proposal).toBeNull();
    const detail = await api(t.owner).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.escalationReasons).toContain('MALFORMED_AI_RESPONSE');
    expect(detail.body.providerCalls[0].status).toBe('MALFORMED');
  });

  it('duplicate submits create one case', async () => {
    const k = key();
    const a = await post(t.customerB, '/ai/conversations', { message: 'Need a CoC for selling my house' }, k).expect(201);
    const b = await post(t.customerB, '/ai/conversations', { message: 'Need a CoC for selling my house' }, k).expect(201);
    const c = await post(t.customerB, '/ai/conversations', { message: 'Need a CoC for selling my house' }, key()).expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(c.body.id).toBe(a.body.id);
  });
});

describe('admin review, human-in-the-loop and proposals', () => {
  let id = '';
  it('lists escalated cases in the review queue with escalation reasons', async () => {
    const c = await start(t.customerA, 'Inverter is beeping and the batteries are not charging [mock:review]');
    id = c.id;
    const q = await api(t.office).get('/ai/admin/cases?tab=NEEDS_REVIEW').expect(200);
    const row = q.body.items.find((x: { id: string }) => x.id === id);
    expect(row).toBeTruthy();
    expect(row.escalationReasons).toContain('AI_REQUESTED_REVIEW');
    const summary = await api(t.office).get('/ai/admin/summary').expect(200);
    expect(summary.body.needsReview).toBeGreaterThan(0);
    expect(summary.body.critical).toBeGreaterThan(0);
  });

  it('admin reply is shown as a PSG Electrical team response and notifies the customer', async () => {
    const res = await post(t.office, `/ai/admin/cases/${id}/reply`, { body: 'Thanks — what brand is the inverter?', requestInformation: true }, key()).expect(200);
    expect(res.body.status).toBe('NEEDS_INFORMATION');
    const cust = await api(t.customerA).get(`/ai/conversations/${id}`).expect(200);
    const msg = cust.body.messages.at(-1);
    expect(msg).toMatchObject({ role: 'ADMIN', kind: 'INFO_REQUEST', authorLabel: 'PSG Electrical team response' });
    expect((await notifications(f.users.customerA.id, 'AI_CASE_UPDATE')).at(-1)?.title).toMatch(/More information requested/);
  });

  it('a customer reply on a team-owned case goes back to the team (AI does not take over)', async () => {
    const res = await post(t.customerA, `/ai/conversations/${id}/messages`, { body: 'It is a Sunsynk 8kW.' }, key()).expect(200);
    expect(res.body.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(res.body.messages.at(-1).role).toBe('CUSTOMER');
  });

  it('a new danger signal on a team-owned case still escalates immediately', async () => {
    const res = await post(t.customerA, `/ai/conversations/${id}/messages`, { body: 'Now the battery is swollen and hot' }, key()).expect(200);
    expect(res.body.severity).toBe(4);
    await post(t.customerA, `/ai/conversations/${id}/messages`, { body: 'There is smoke now' }, key()).expect(200);
    const c = await api(t.customerA).get(`/ai/conversations/${id}`).expect(200);
    expect(c.body.severity).toBe(5);
    expect(c.body.safetyWarning).toBeTruthy();
  });

  it('admin edits severity and price (new version, AI version kept), sends the proposal, customer accepts', async () => {
    const edit = await post(t.office, `/ai/admin/cases/${id}/assessment`, { severity: 3, priceMin: 1800, priceMax: 3200, note: 'Spoke to customer; smoke was from a nearby braai' }).expect(200);
    expect(edit.body.assessment.source).toBe('ADMIN');
    expect(edit.body.assessment.adminPrice).toEqual({ min: 1800, max: 3200 });
    expect(edit.body.assessments.length).toBeGreaterThan(1);
    expect(edit.body.reviews.at(-1).changes.severity.belowRuleFloor).toBe(true);
    const sent = await post(t.office, `/ai/admin/cases/${id}/proposal`, {}, key()).expect(200);
    expect(sent.body.status).toBe('PROPOSAL_SENT');
    expect(sent.body.proposal).toMatchObject({ priceMin: 1800, priceMax: 3200, priceSource: 'ADMIN', approvedByAdmin: true });
    const cust = await api(t.customerA).get(`/ai/conversations/${id}`).expect(200);
    expect(cust.body.proposal.priceSource).toBe('ADMIN');
    expect(cust.body.can.accept).toBe(true);
    expect((await notifications(f.users.customerA.id, 'AI_PROPOSAL_READY')).length).toBeGreaterThan(0);
    const acc = await post(t.customerA, `/ai/conversations/${id}/accept`, { siteAddress: '5 Beach Road, Umhlanga', confirm: true }, key()).expect(200);
    expect(acc.body.proposal.status).toBe('ACCEPTED');
  });

  it('admin can convert and close cases; conversion is idempotent', async () => {
    const c = await start(t.customerB, 'Please quote for a new plug point [mock:review]');
    const k = key();
    const body = { serviceTypeId: faultServiceId, siteAddress: '9 Long Street, Durban' };
    const a = await post(t.office, `/ai/admin/cases/${c.id}/convert`, body, k).expect(201);
    expect(a.body.status).toBe('CONVERTED_TO_JOB');
    await post(t.office, `/ai/admin/cases/${c.id}/convert`, body, key()).expect(201);
    expect((await db().query('SELECT count(*)::int AS n FROM jobs WHERE ai_conversation_id = $1', [c.id])).rows[0]!.n).toBe(1);
    const d = await start(t.customerB, 'Lights strange [mock:review]');
    const closed = await post(t.owner, `/ai/admin/cases/${d.id}/close`, { reason: 'Duplicate of an existing job' }, key()).expect(200);
    expect(closed.body.status).toBe('CLOSED');
  });

  it('stores admin feedback without changing pricing', async () => {
    const before = (await db().query(`SELECT count(*)::int AS n FROM ai_policies WHERE kind = 'PRICING'`)).rows[0]!.n;
    const res = await post(t.office, `/ai/admin/cases/${id}/feedback`, { assessmentVerdict: 'PARTIALLY_CORRECT', severityVerdict: 'TOO_HIGH', priceVerdict: 'TOO_LOW' }).expect(200);
    expect(res.body.adminFeedback.severityVerdict).toBe('TOO_HIGH');
    expect((await db().query(`SELECT count(*)::int AS n FROM ai_policies WHERE kind = 'PRICING'`)).rows[0]!.n).toBe(before);
  });
});

describe('learning through approved knowledge (no model training)', () => {
  const POOL = 'Our pool pump keeps stopping and the timer clicks';
  let unknownId = '';
  let entryId = '';

  it('an unrecognised request escalates instead of inventing an answer', async () => {
    const c = await start(t.customerA, POOL);
    unknownId = c.id;
    expect(c.status).toBe('NEEDS_ADMIN_REVIEW');
    expect(c.proposal).toBeNull();
    const detail = await api(t.office).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.escalationReasons).toEqual(expect.arrayContaining(['UNSUPPORTED_CATEGORY', 'LOW_CONFIDENCE']));
    expect(detail.body.assessment.retrievedKnowledge).toEqual([]);
  });

  it('knowledge cannot be created from an unresolved case', async () => {
    const res = await post(t.office, `/ai/admin/cases/${unknownId}/knowledge`, {
      title: 'Pool pump stops', serviceCategory: 'FAULT_FINDING', problemSummary: 'Pool pump stops running', severity: 2, recommendedResponse: 'Book fault finding on the pump circuit.',
    }, key()).expect(422);
    expect(res.body.error.code).toBe('AI_CASE_NOT_RESOLVED');
  });

  it('admin resolves the case and approves the resolution as knowledge', async () => {
    await post(t.office, `/ai/admin/cases/${unknownId}/reply`, { body: 'This is usually a pool pump circuit or timer fault — we will book fault finding.' }, key()).expect(200);
    const res = await post(t.office, `/ai/admin/cases/${unknownId}/knowledge`, {
      title: 'Pool pump stops intermittently',
      serviceCategory: 'FAULT_FINDING',
      problemSummary: 'Pool pump stops running or the timer clicks but the pump does not start.',
      symptoms: ['pump stops after a few minutes', 'timer clicks'],
      severity: 2,
      pricingContext: 'Usually 1–2 hours fault finding plus possible timer or contactor replacement.',
      recommendedResponse: 'Book electrical fault finding on the pool pump circuit; a technician will test the pump, timer and protection.',
      clarifyingQuestions: ['Does the pump trip the breaker or simply stop?'],
      keywords: ['pool', 'pump', 'timer'],
    }, key()).expect(201);
    entryId = res.body.id;
    expect(res.body).toMatchObject({ status: 'APPROVED', active: true, version: 1, sourceConversationId: unknownId });
    expect(res.body.approvedByName).toBeTruthy();
  });

  it('a similar new case retrieves the approved knowledge and performs better', async () => {
    const c = await start(t.customerB, 'The pool pump stops working after a few minutes');
    const detail = await api(t.office).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.assessment.retrievedKnowledge.map((k: { id: string }) => k.id)).toContain(entryId);
    // Before: unknown → escalated. Now: recognised, and it asks the admin-approved follow-up question.
    expect(c.status).toBe('NEEDS_INFORMATION');
    expect(c.messages.at(-1).questions).toEqual(['Does the pump trip the breaker or simply stop?']);
    const answered = await post(t.customerB, `/ai/conversations/${c.id}/messages`, { body: 'It simply stops, nothing trips.' }, key()).expect(200);
    expect(answered.body.status).toBe('AI_ANSWERED');
    expect(answered.body.assessment.serviceCategory).toBe('FAULT_FINDING');
    expect(answered.body.proposal).not.toBeNull();
    const k = await api(t.office).get(`/ai/knowledge/${entryId}`).expect(200);
    expect(k.body.timesRetrieved).toBe(2);
  });

  it('pending / inactive knowledge is never retrieved', async () => {
    await setSettings({ officeAdminCanApproveKnowledge: false });
    const pending = await post(t.office, '/ai/knowledge', {
      title: 'Gate motor not opening', serviceCategory: 'FAULT_FINDING', problemSummary: 'Electric gate motor does not open.', severity: 2,
      recommendedResponse: 'Book fault finding on the gate motor supply.', keywords: ['gate', 'motor'],
    }, key()).expect(201);
    expect(pending.body).toMatchObject({ status: 'PENDING', active: false });
    await post(t.office, `/ai/knowledge/${pending.body.id}/approve`, {}).expect(403);
    const c = await start(t.customerB, 'My gate motor is not opening');
    const detail = await api(t.office).get(`/ai/admin/cases/${c.id}`).expect(200);
    expect(detail.body.assessment.retrievedKnowledge.map((k: { id: string }) => k.id)).not.toContain(pending.body.id);
    await post(t.owner, `/ai/knowledge/${pending.body.id}/approve`, {}).expect(200);
    await post(t.office, `/ai/knowledge/${entryId}/active`, { active: false }).expect(200);
    const again = await start(t.customerA, 'Pool pump stops after a few minutes again');
    const d2 = await api(t.office).get(`/ai/admin/cases/${again.id}`).expect(200);
    expect(d2.body.assessment.retrievedKnowledge.map((k: { id: string }) => k.id)).not.toContain(entryId);
    await setSettings({ officeAdminCanApproveKnowledge: true });
  });

  it('editing creates a new version with a revision trail; owner-only archive/delete', async () => {
    const res = await request(getApp()).patch(`${API}/ai/knowledge/${entryId}`).set('Authorization', `Bearer ${t.office}`).send({ keywords: ['pool', 'pump', 'timer', 'stops'], changeNote: 'More keywords' }).expect(200);
    expect(res.body.version).toBe(2);
    expect(res.body.revisions.map((r: { version: number }) => r.version)).toEqual([2, 1]);
    await post(t.office, `/ai/knowledge/${entryId}/archive`, {}).expect(403);
    await request(getApp()).delete(`${API}/ai/knowledge/${entryId}`).set('Authorization', `Bearer ${t.office}`).expect(403);
    const archived = await post(t.owner, `/ai/knowledge/${entryId}/archive`, {}).expect(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', active: false });
  });
});

describe('security and privacy', () => {
  let caseA = '';
  let photoA = '';
  beforeAll(async () => {
    photoA = await uploadAiPhoto(t.customerA);
    caseA = (await start(t.customerA, 'My outside light does not switch on', { attachmentIds: [photoA] })).id;
  });

  it("a customer cannot view or act on another customer's AI case", async () => {
    await api(t.customerB).get(`/ai/conversations/${caseA}`).expect(404);
    await post(t.customerB, `/ai/conversations/${caseA}/messages`, { body: 'hi' }, key()).expect(404);
    await post(t.customerB, `/ai/conversations/${caseA}/accept`, { siteAddress: '1 Some Road', confirm: true }, key()).expect(404);
  });

  it('employees and customers cannot browse the AI queue or knowledge', async () => {
    await api(t.electrician1).get('/ai/admin/cases').expect(403);
    await api(t.electrician1).get(`/ai/admin/cases/${caseA}`).expect(403);
    await api(t.customerA).get('/ai/admin/cases').expect(403);
    await api(t.electrician1).get('/ai/knowledge').expect(403);
    await api(t.electrician1).get('/ai/conversations').expect(403);
  });

  it('an unassigned employee cannot see the AI assessment behind a job', async () => {
    const job = (await db().query<{ id: string }>('SELECT id FROM jobs WHERE ai_conversation_id IS NOT NULL LIMIT 1')).rows[0]!;
    await api(t.electrician2).get(`/jobs/${job.id}/ai-assessment`).expect(404);
  });

  it('office admins cannot change Owner AI configuration; settings never expose secrets', async () => {
    const s = await api(t.office).get('/ai/settings').expect(200);
    expect(s.body.canEdit).toBe(false);
    expect(s.body.provider.apiKey).toBe('Not configured');
    expect(JSON.stringify(s.body)).not.toMatch(/sk-|secret/i);
    await request(getApp()).put(`${API}/ai/settings`).set('Authorization', `Bearer ${t.office}`).send({ settings: s.body.settings }).expect(403);
    await request(getApp()).put(`${API}/ai/policies/pricing`).set('Authorization', `Bearer ${t.office}`).send({ policy: s.body.pricingPolicy }).expect(403);
    await request(getApp()).put(`${API}/ai/policies/severity`).set('Authorization', `Bearer ${t.office}`).send({ policy: s.body.severityPolicy }).expect(403);
  });

  it('owner policy changes are versioned and validated', async () => {
    const s = await api(t.owner).get('/ai/settings').expect(200);
    const sev = s.body.severityPolicy;
    sev.levels[2].responseWindow = 'within approximately 12 hours';
    const res = await request(getApp()).put(`${API}/ai/policies/severity`).set('Authorization', `Bearer ${t.owner}`).send({ policy: sev, changeNote: 'Faster target' }).expect(200);
    expect(res.body.severityPolicyVersion).toBe(s.body.severityPolicyVersion + 1);
    const bad = { ...sev, levels: sev.levels.map((l: { level: number }) => (l.level === 5 ? { ...l, escalate: false } : l)) };
    await request(getApp()).put(`${API}/ai/policies/severity`).set('Authorization', `Bearer ${t.owner}`).send({ policy: bad }).expect(422);
    const pricing = { ...s.body.pricingPolicy, categories: s.body.pricingPolicy.categories.map((c: { code: string }) => (c.code === 'LIGHTING' ? { ...c, serviceTypeSlug: 'does-not-exist' } : c)) };
    await request(getApp()).put(`${API}/ai/policies/pricing`).set('Authorization', `Bearer ${t.owner}`).send({ policy: pricing }).expect(400);
    const versions = await api(t.office).get('/ai/policies/SEVERITY/versions').expect(200);
    expect(versions.body[0].changeNote).toBe('Faster target');
  });

  it('AI photos are private: other customers and unassigned staff get 404', async () => {
    await api(t.customerA).get(`/files/${photoA}`).expect(200);
    await api(t.customerB).get(`/files/${photoA}`).expect(404);
    await api(t.electrician1).get(`/files/${photoA}`).expect(404);
    await api(t.office).get(`/files/${photoA}`).expect(200);
  });

  it('rejects invalid uploads and photos that are not the caller\'s', async () => {
    const fake = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${t.customerA}`).field('purpose', 'AI_ASSESSMENT_PHOTO').attach('file', Buffer.from('MZ this is not an image at all'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(fake.status).toBe(415);
    const staff = await request(getApp()).post(`${API}/files`).set('Authorization', `Bearer ${t.office}`).field('purpose', 'AI_ASSESSMENT_PHOTO').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(staff.status).toBe(403);
    const bPhoto = await uploadAiPhoto(t.customerB);
    await post(t.customerA, '/ai/conversations', { message: 'Plug is loose', attachmentIds: [bPhoto] }, key()).expect(400);
  });

  it('rejects unsafe field updates (unknown fields are not accepted)', async () => {
    const res = await post(t.customerA, '/ai/conversations', { message: 'Light broken', status: 'CONVERTED_TO_JOB', currentSeverity: 1 }, key());
    expect(res.status).toBe(422);
    await post(t.customerA, `/ai/conversations/${caseA}/messages`, { body: 'x', role: 'ADMIN' }, key()).expect(422);
  });

  it('enforces the per-case photo limit', async () => {
    await setSettings({ maxImagesPerConversation: 1 });
    const p = await uploadAiPhoto(t.customerA);
    const res = await post(t.customerA, `/ai/conversations/${caseA}/messages`, { body: 'another photo', attachmentIds: [p] }, key());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('AI_TOO_MANY_IMAGES');
    await setSettings({ maxImagesPerConversation: 8 });
  });

  it('records an AI audit trail without secrets', async () => {
    const rows = (await db().query<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM audit_logs WHERE action = 'AI_ASSESSMENT_CREATED' AND entity_id = $1`, [caseA])).rows;
    expect(rows[0]!.metadata).toMatchObject({ provider: 'mock', model: 'hydra-dev-simulation-1', severityPolicyVersion: 1 });
  });

  it('POPIA export includes AI conversations', async () => {
    const res = await api(t.customerA).get('/profile/data-export').expect(200);
    expect(res.body.aiAssessments.length).toBeGreaterThan(0);
    expect(res.body.aiAssessments[0].messages.length).toBeGreaterThan(0);
  });
});

describe('feature flag and analytics', () => {
  it('when disabled, customers get a safe unavailable state; history still loads', async () => {
    await setSettings({ featureEnabled: false });
    const s = await api(t.customerA).get('/ai/status').expect(200);
    expect(s.body.enabled).toBe(false);
    expect(s.body.unavailableReason).toBeTruthy();
    const res = await post(t.customerA, '/ai/conversations', { message: 'Light broken in bedroom' }, key()).expect(503);
    expect(res.body.error.code).toBe('AI_ASSISTANT_DISABLED');
    await api(t.customerA).get('/ai/conversations').expect(200);
    // Existing HYDRA functionality is unaffected.
    await api(t.customerA).get('/dashboard/customer').expect(200);
    await setSettings({ featureEnabled: true });
  });

  it('computes analytics from stored data', async () => {
    const res = await api(t.owner).get('/ai/analytics').expect(200);
    expect(res.body.totals.enquiries).toBeGreaterThan(5);
    expect(res.body.totals.escalated).toBeGreaterThan(0);
    expect(res.body.totals.knowledgeAdded).toBeGreaterThan(0);
    expect(res.body.totals.correctedByAdmin).toBeGreaterThan(0);
    expect(res.body.bySeverity.length).toBeGreaterThan(0);
    expect(res.body.feedback.severity.TOO_HIGH).toBe(1);
    await api(t.electrician1).get('/ai/analytics').expect(403);
  });
});

describe('development seed', () => {
  it('is additive and idempotent (policies, approved knowledge, sample cases)', async () => {
    await db().query('DELETE FROM ai_knowledge_entries');
    const users = new PostgresUserRepository(db());
    const id = await users.create({ email: 'customer@hydra.demo', passwordHash: null, role: 'CUSTOMER' });
    await users.createCustomerProfile(id, { firstName: 'Lerato', lastName: 'Demo', phone: null, address: null, marketingOptIn: false });
    const usersBefore = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM users')).rows[0]!.n;
    await seedSmartQuote();
    await seedSmartQuote();
    const k = (await db().query<{ n: number; approved: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'APPROVED' AND active)::int AS approved FROM ai_knowledge_entries`)).rows[0]!;
    expect(k).toEqual({ n: 3, approved: 3 });
    const cases = (await db().query<{ status: string }>('SELECT c.status FROM ai_conversations c JOIN users u ON u.id = c.user_id WHERE u.email = $1 ORDER BY c.created_at', ['customer@hydra.demo'])).rows;
    // The geyser case retrieves the seeded knowledge and asks its approved follow-up questions.
    expect(cases.map((c) => c.status)).toEqual(['NEEDS_INFORMATION', 'NEEDS_ADMIN_REVIEW']);
    expect((await db().query<{ n: number }>('SELECT count(*)::int AS n FROM users')).rows[0]!.n).toBe(usersBefore);
  });
});
