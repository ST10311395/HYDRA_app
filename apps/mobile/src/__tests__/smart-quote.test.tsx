/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/* HYDRA Smart Quote — customer, admin and owner screens (docs/AI_ASSISTANT.md). */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { AiCaseDetailDto, AiConversationDto, AiSettingsDto, AiStatusDto } from '@hydra/shared';
import AiCase from '../app/admin/ai-case/[id]';
import AiKnowledgeList from '../app/admin/ai-knowledge';
import AiReviewQueue from '../app/admin/ai-review';
import AiSettingsScreen from '../app/admin/ai-settings';
import AssessmentConversation from '../app/customer/ai/[id]';
import SmartQuoteHome from '../app/customer/ai/index';
import NewAssessment from '../app/customer/ai/new';
import { JobAiSection } from '../features/ai/JobAiSection';
import { routeForNotification } from '../navigation/notificationRoutes';
import { mockApi, paged, renderScreen, respond, signInAs } from '../test-utils';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///db.jpg', fileName: 'db.jpg', mimeType: 'image/jpeg', fileSize: 120_000 }] })),
}));

const setParams = (p: Record<string, string>) => (jest.requireMock('expo-router') as { __setParams: (p: object) => void }).__setParams(p);
const ID = '7b1d3f6c-2a1e-4c55-9a55-1c2d3e4f5a6b';

const status = (over: Partial<AiStatusDto> = {}): AiStatusDto => ({
  enabled: true, simulation: true, simulationLabel: 'Development AI simulation', providerConfigured: true, supportsImages: false, humanOnly: false,
  maxImagesPerConversation: 8, maxImagesPerMessage: 6, maxClarificationRounds: 3, disclaimer: 'This assessment is based on the information and images provided. It is a preliminary estimate and not a final electrical diagnosis or binding quotation.',
  estimateNotice: 'Preliminary estimate only. Final pricing may change following on-site inspection.', unavailableReason: null, ...over,
});

const response = { severity: 3, severityName: 'High', targetResponse: 'Priority response', responseWindow: 'within approximately 24 hours', wording: 'Priority response — target response within approximately 24 hours, subject to technician availability.', outOfHoursNotice: null };

function conversation(over: Partial<AiConversationDto> = {}): AiConversationDto {
  return {
    id: ID, reference: 'AIQ-001001', title: 'My DB trips whenever I turn my geyser on.', status: 'AI_ANSWERED', statusLabel: 'Preliminary proposal ready', severity: 3,
    estimateMin: 1800, estimateMax: 3200, adminReview: 'NOT_REQUIRED', proposalStatus: 'SENT', jobId: null, jobReference: null, isSimulation: true,
    createdAt: '2026-10-04T08:00:00Z', updatedAt: '2026-10-04T08:05:00Z', propertyType: 'RESIDENTIAL', siteArea: null, urgency: 'STANDARD',
    messages: [
      { id: 'm1', role: 'CUSTOMER', kind: 'TEXT', body: 'My DB trips whenever I turn my geyser on.', authorLabel: 'You', questions: [], attachments: [], createdAt: '2026-10-04T08:00:00Z' },
      { id: 'm2', role: 'ASSISTANT', kind: 'CLARIFICATION', body: 'Thanks. I can help assess this for a quotation. Before I prepare an estimate, can you tell me:', authorLabel: 'HYDRA Smart Quote · Development AI simulation', questions: ['Does the main breaker trip, or only the geyser circuit?', 'Is there any burning smell, heat or visible damage?'], attachments: [], createdAt: '2026-10-04T08:00:01Z' },
    ],
    assessment: {
      id: 'a1', version: 2, source: 'AI', summary: 'Geyser circuit repeatedly trips the DB.', serviceCategory: 'FAULT_FINDING', serviceCategoryLabel: 'Electrical fault finding',
      observations: ['Mentions: trips, geyser'], severity: 3, severityName: 'High', severityReason: 'Repeated tripping', safetyFlags: [], confidence: 82, outcome: 'PROPOSAL', response,
      estimate: { min: 1800, max: 3200, serviceMin: 1500, serviceMax: 2500, labourMin: 700, labourMax: 1500, materialsMin: 300, materialsMax: 700, callout: 630, urgencyMin: 70, urgencyMax: 150, afterHours: false, includesVat: true, basis: ['Call-out R550'], clamped: false },
      imageAnalysis: { status: 'UNAVAILABLE', notice: 'AI image analysis is unavailable in this development environment.', notes: [] }, isSimulation: true, createdAt: '2026-10-04T08:05:00Z',
    },
    proposal: {
      id: 'p1', status: 'SENT', assessmentId: 'a1', priceMin: 1800, priceMax: 3200, priceSource: 'SYSTEM', severity: 3, severityName: 'High', targetResponse: 'Priority response',
      responseWording: response.wording, serviceCategoryLabel: 'Electrical fault finding', summary: 'Geyser circuit repeatedly trips the DB.', message: null,
      includes: ['Call-out', 'Fault investigation / assessment on site', 'Estimated labour'], potentialAdditionalCosts: ['Replacement components or parts if required'],
      approvedByAdmin: false, sentAt: '2026-10-04T08:05:00Z', acceptedAt: null, declinedAt: null, jobId: null, jobReference: null,
    },
    clarificationRounds: 1, maxClarificationRounds: 3, safetyWarning: null, pendingReview: false, customerFeedback: null,
    can: { sendMessage: true, accept: true, decline: true, requestReview: true, giveFeedback: false },
    notices: { disclaimer: status().disclaimer, estimateNotice: status().estimateNotice, simulation: 'Development AI simulation' },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('customer: Smart Quote home and history', () => {
  it('shows the simulation label, history with severity/estimate/job and starts an assessment', async () => {
    signInAs('CUSTOMER');
    mockApi({
      'GET /ai/status': () => status(),
      'GET /ai/conversations': () => paged([{ ...conversation(), status: 'CONVERTED_TO_JOB', statusLabel: 'Service request created', proposalStatus: 'ACCEPTED', jobId: 'job-1', jobReference: 'HYD-001002' }]),
    });
    await renderScreen(<SmartQuoteHome />);
    expect(await screen.findByTestId('ai-simulation-banner')).toHaveTextContent(/Development AI simulation/);
    expect(await screen.findByText('Service request HYD-001002')).toBeOnTheScreen();
    expect(screen.getByText('3/5 · HIGH')).toBeOnTheScreen();
    expect(screen.getByText(/Preliminary estimate R\s?1\s?800/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('ai-start'));
    expect(router.push).toHaveBeenCalledWith('/customer/ai/new');
    await fireEvent.press(screen.getByTestId(`ai-history-${ID}`));
    expect(router.push).toHaveBeenCalledWith(`/customer/ai/${ID}`);
  });

  it('shows a safe unavailable state when the feature flag is off', async () => {
    signInAs('CUSTOMER');
    mockApi({ 'GET /ai/status': () => status({ enabled: false, unavailableReason: 'HYDRA Smart Quote is switched off at the moment.' }), 'GET /ai/conversations': () => paged([]) });
    await renderScreen(<SmartQuoteHome />);
    expect(await screen.findByTestId('ai-unavailable')).toHaveTextContent(/switched off/);
    expect(screen.getByTestId('ai-start')).toBeDisabled();
    expect(screen.getByText('Request a service instead')).toBeOnTheScreen();
  });
});

describe('customer: new assessment', () => {
  it('validates before calling the API', async () => {
    signInAs('CUSTOMER');
    const m = mockApi({ 'GET /ai/status': () => status() });
    await renderScreen(<NewAssessment />);
    await fireEvent.press(await screen.findByTestId('ai-submit'));
    expect(await screen.findByText('Describe the problem in a few words')).toBeOnTheScreen();
    expect(m.find('POST', '/ai/conversations')).toHaveLength(0);
  });

  it('attaches a gallery photo (removable), submits with an idempotency key and opens the case', async () => {
    signInAs('CUSTOMER');
    const m = mockApi({
      'GET /ai/status': () => status(),
      'POST /files': () => respond(201, { id: 'file-1', fileName: 'db.jpg', mimeType: 'image/jpeg', sizeBytes: 1, url: 'http://x/db.jpg', purpose: 'AI_ASSESSMENT_PHOTO', createdAt: '' }),
      'POST /ai/conversations': () => respond(201, conversation({ status: 'NEEDS_INFORMATION' })),
    });
    await renderScreen(<NewAssessment />);
    await fireEvent.changeText(await screen.findByTestId('ai-message'), 'My DB trips whenever I turn my geyser on.');
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByLabelText('Attached photo')).toBeOnTheScreen();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(m.find('POST', '/files')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.queryByLabelText('Attached photo')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    await screen.findByLabelText('Attached photo');
    await fireEvent.press(screen.getByTestId('ai-submit'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/customer/ai/${ID}`));
    const call = m.find('POST', '/ai/conversations')[0]!;
    expect(call.body).toMatchObject({ message: 'My DB trips whenever I turn my geyser on.', attachmentIds: ['file-1'], propertyType: 'RESIDENTIAL' });
    expect(call.headers['Idempotency-Key']).toMatch(/^m-/);
  });
});

describe('customer: conversation, assessment and proposal', () => {
  beforeEach(() => setParams({ id: ID }));

  it('shows clarifying questions, the structured assessment, severity, estimate and notices', async () => {
    signInAs('CUSTOMER');
    mockApi({ [`GET /ai/conversations/${ID}`]: () => conversation() });
    await renderScreen(<AssessmentConversation />);
    expect(await screen.findByText(/Does the main breaker trip, or only the geyser circuit\?/)).toBeOnTheScreen();
    expect(screen.getByTestId('ai-assessment-card')).toBeOnTheScreen();
    expect(screen.getByText('3 / 5 — High')).toBeOnTheScreen();
    expect(screen.getByLabelText('Severity 3 of 5, High')).toBeOnTheScreen();
    expect(screen.getByTestId('ai-estimate')).toHaveTextContent(/R\s?1\s?800(\.00)?\s?–\s?R\s?3\s?200/);
    expect(screen.getByText(/subject to technician availability/)).toBeOnTheScreen();
    expect(screen.getByText('Preliminary estimate only. Final pricing may change following on-site inspection.')).toBeOnTheScreen();
    expect(screen.getByText('82%')).toBeOnTheScreen();
    expect(screen.getByText(/AI image analysis is unavailable in this development environment/)).toBeOnTheScreen();
  });

  it('accepts with site address + confirmation (idempotent key) and never fakes a paid invoice', async () => {
    signInAs('CUSTOMER', { address: null });
    const accepted = conversation({ status: 'CONVERTED_TO_JOB', jobId: 'job-1', jobReference: 'HYD-001002', can: { sendMessage: false, accept: false, decline: false, requestReview: false, giveFeedback: false }, proposal: { ...conversation().proposal!, status: 'ACCEPTED' } });
    let current = conversation();
    const m = mockApi({
      [`GET /ai/conversations/${ID}`]: () => current,
      [`POST /ai/conversations/${ID}/accept`]: () => (current = accepted),
    });
    await renderScreen(<AssessmentConversation />);
    await fireEvent.press(await screen.findByTestId('ai-accept'));
    await fireEvent.press(screen.getByTestId('ai-accept-confirm'));
    expect(m.find('POST', `/ai/conversations/${ID}/accept`)).toHaveLength(0); // address + confirmation required
    await fireEvent.changeText(screen.getByTestId('ai-accept-address'), '12 Main Road, Durban');
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByTestId('ai-accept-confirm'));
    expect(await screen.findByTestId('ai-accepted')).toHaveTextContent(/HYD-001002/);
    const call = m.find('POST', `/ai/conversations/${ID}/accept`)[0]!;
    expect(call.body).toEqual({ siteAddress: '12 Main Road, Durban', confirm: true });
    expect(call.headers['Idempotency-Key']).toBeTruthy();
    expect(m.calls.some((c) => c.path.includes('/payments'))).toBe(false);
  });

  it('declines after confirmation', async () => {
    signInAs('CUSTOMER');
    let current = conversation();
    const m = mockApi({ [`GET /ai/conversations/${ID}`]: () => current, [`POST /ai/conversations/${ID}/decline`]: () => (current = conversation({ status: 'CLOSED', statusLabel: 'Closed', can: { sendMessage: false, accept: false, decline: false, requestReview: false, giveFeedback: false } })) });
    await renderScreen(<AssessmentConversation />);
    await fireEvent.press(await screen.findByTestId('ai-decline'));
    expect(await screen.findByText('Decline this proposal?')).toBeOnTheScreen();
    const buttons = screen.getAllByRole('button', { name: 'Decline' });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(m.find('POST', `/ai/conversations/${ID}/decline`)).toHaveLength(1));
  });

  it('requests admin review', async () => {
    signInAs('CUSTOMER');
    let current = conversation();
    const m = mockApi({ [`GET /ai/conversations/${ID}`]: () => current, [`POST /ai/conversations/${ID}/request-review`]: () => (current = conversation({ status: 'NEEDS_ADMIN_REVIEW', pendingReview: true })) });
    await renderScreen(<AssessmentConversation />);
    await fireEvent.press(await screen.findByTestId('ai-request-review'));
    expect(await screen.findByTestId('ai-pending-review')).toBeOnTheScreen();
    expect(m.find('POST', `/ai/conversations/${ID}/request-review`)).toHaveLength(1);
  });

  it('sends follow-up information', async () => {
    signInAs('CUSTOMER');
    const m = mockApi({ [`GET /ai/conversations/${ID}`]: () => conversation({ status: 'NEEDS_INFORMATION', assessment: null, proposal: null }), [`POST /ai/conversations/${ID}/messages`]: () => conversation() });
    await renderScreen(<AssessmentConversation />);
    await fireEvent.changeText(await screen.findByTestId('ai-reply'), 'Only the geyser circuit trips.');
    await fireEvent.press(screen.getByTestId('ai-send'));
    await waitFor(() => expect(m.find('POST', `/ai/conversations/${ID}/messages`)).toHaveLength(1));
    expect(m.find('POST', `/ai/conversations/${ID}/messages`)[0]!.body).toEqual({ body: 'Only the geyser circuit trips.', attachmentIds: [] });
  });

  it('severity 5: strong safety warning, no proposal actions', async () => {
    signInAs('CUSTOMER');
    mockApi({
      [`GET /ai/conversations/${ID}`]: () => conversation({
        status: 'NEEDS_ADMIN_REVIEW', severity: 5, pendingReview: true, proposal: null,
        safetyWarning: 'This may represent an immediate electrical safety risk. Do not touch damaged electrical equipment.',
        assessment: { ...conversation().assessment!, severity: 5, severityName: 'Critical', outcome: 'SAFETY_ESCALATION', estimate: null },
        can: { sendMessage: true, accept: false, decline: false, requestReview: false, giveFeedback: false },
      }),
    });
    await renderScreen(<AssessmentConversation />);
    expect(await screen.findByTestId('ai-safety-warning')).toHaveTextContent(/Do not touch damaged electrical equipment/);
    expect(screen.getByText('5/5 · CRITICAL')).toBeOnTheScreen();
    expect(screen.queryByTestId('ai-accept')).toBeNull();
    expect(screen.queryByTestId('ai-estimate')).toBeNull();
  });

  it('labels team replies as a PSG Electrical team response', async () => {
    signInAs('CUSTOMER');
    mockApi({
      [`GET /ai/conversations/${ID}`]: () => conversation({
        status: 'ADMIN_RESPONDED',
        messages: [...conversation().messages, { id: 'm3', role: 'ADMIN', kind: 'ADMIN_REPLY', body: 'We will call you shortly.', authorLabel: 'PSG Electrical team response', questions: [], attachments: [], createdAt: '2026-10-04T09:00:00Z' }],
      }),
    });
    await renderScreen(<AssessmentConversation />);
    expect(await screen.findByLabelText('PSG Electrical team response: We will call you shortly.')).toBeOnTheScreen();
  });
});

const caseDetail = (over: Partial<AiCaseDetailDto> = {}): AiCaseDetailDto => {
  const conv = conversation({ status: 'NEEDS_ADMIN_REVIEW' });
  return {
    id: ID, reference: 'AIQ-001001', title: conv.title, status: 'NEEDS_ADMIN_REVIEW', statusLabel: 'With our team for review', customerName: 'Thandi Test', firstMessage: conv.title,
    thumbnails: [], serviceCategoryLabel: 'Electrical fault finding', severity: 3, confidence: 70, estimateMin: 1800, estimateMax: 3200, escalationReasons: ['REVIEW_RECOMMENDED'],
    reviewRequired: true, humanRequested: false, isSimulation: true, ageMinutes: 45, createdAt: '', updatedAt: '',
    customer: { id: 'c1', userId: 'u1', name: 'Thandi Test', email: 'thandi@test.local', phone: null }, propertyType: 'RESIDENTIAL', siteArea: null, urgency: null,
    messages: conv.messages, attachments: [],
    assessment: {
      ...conv.assessment!, confidence: 70, provider: 'mock', model: 'hydra-dev-simulation-1', promptVersion: 'smartquote-2026-10-04.1', severityPolicyVersion: 1, pricingPolicyVersion: 1, settingsVersion: 1,
      aiSeverity: 3, ruleSeverityFloor: null, aiConfidence: 75, safetyTriggers: [{ code: 'BURNING_SMELL', label: 'Burning smell', matched: 'burning smell', minSeverity: 4, negated: true }],
      escalationReasons: ['REVIEW_RECOMMENDED'], requiresAdminReview: true, aiInputs: { labourHours: { min: 1, max: 2 }, pricingFactors: [], rawCategory: 'FAULT_FINDING', clarifyingQuestions: [] },
      systemEstimate: conv.assessment!.estimate, adminPrice: null, historicalReference: null, retrievedKnowledge: [{ id: 'k1', version: 2, title: 'Geyser trips DB', score: 0.7 }], createdByName: null, latencyMs: 12, errorCode: null,
    },
    assessments: [], proposal: null, reviews: [], adminFeedback: null, customerFeedback: null, providerCalls: [], knowledgeEntries: [], jobId: null, jobReference: null,
    allowedActions: ['FEEDBACK', 'REPLY', 'REQUEST_INFO', 'EDIT', 'CLOSE', 'APPROVE_AI', 'CONVERT'],
    ...over,
  };
};

describe('admin: AI Review queue and case', () => {
  it('lists cases with severity, confidence and escalation reasons; critical cases are prominent', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({
      'GET /ai/admin/summary': () => ({ needsReview: 2, urgent: 1, critical: 1, waitingCustomer: 0, accepted: 0 }),
      'GET /ai/admin/cases': (c) => paged(c.query.tab === 'NEEDS_REVIEW' ? [{ ...caseDetail(), escalationReasons: ['LOW_CONFIDENCE', 'IMAGE_UNCLEAR'] }] : []),
    });
    await renderScreen(<AiReviewQueue />);
    expect(await screen.findByText(/1 CRITICAL \(severity 5\) case open/)).toBeOnTheScreen();
    expect(await screen.findByText('Thandi Test')).toBeOnTheScreen();
    expect(screen.getByText(/70% conf/i)).toBeOnTheScreen();
    expect(screen.getByText(/AI confidence below the review threshold · Images unclear/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId(`ai-case-${ID}`));
    expect(router.push).toHaveBeenCalledWith(`/admin/ai-case/${ID}`);
  });

  it('shows why the case escalated, the audit trail and retrieved knowledge; replies and approves', async () => {
    signInAs('ADMIN_OFFICE');
    setParams({ id: ID });
    const m = mockApi({
      [`GET /ai/admin/cases/${ID}`]: () => caseDetail(),
      'GET /ai/settings': () => ({ pricingPolicy: { categories: [{ code: 'FAULT_FINDING', label: 'Electrical fault finding' }] } }),
      'GET /service-types': () => [],
      [`POST /ai/admin/cases/${ID}/reply`]: () => caseDetail({ status: 'NEEDS_INFORMATION' }),
      [`POST /ai/admin/cases/${ID}/proposal`]: () => caseDetail({ status: 'PROPOSAL_SENT', allowedActions: ['FEEDBACK'] }),
    });
    await renderScreen(<AiCase />);
    expect(await screen.findByTestId('ai-escalation-reasons')).toHaveTextContent(/review-recommended band/);
    expect(screen.getByText(/○ \(negated\) Burning smell/)).toBeOnTheScreen();
    expect(screen.getByText(/Geyser trips DB \(v2, score 0.7\)/)).toBeOnTheScreen();
    expect(screen.getByText(/never shown directly/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('ai-admin-reply-text'), 'Which brand is the geyser?');
    await fireEvent.press(screen.getByText('This asks the customer for more information'));
    await fireEvent.press(screen.getByTestId('ai-admin-send-reply'));
    await waitFor(() => expect(m.find('POST', `/ai/admin/cases/${ID}/reply`)).toHaveLength(1));
    expect(m.find('POST', `/ai/admin/cases/${ID}/reply`)[0]!.body).toEqual({ body: 'Which brand is the geyser?', requestInformation: true });
    await fireEvent.press(screen.getByTestId('ai-admin-send-proposal'));
    await waitFor(() => expect(m.find('POST', `/ai/admin/cases/${ID}/proposal`)).toHaveLength(1));
  });

  it('requires a reason before saving an edited severity / price', async () => {
    signInAs('ADMIN_OWNER');
    setParams({ id: ID });
    const m = mockApi({
      [`GET /ai/admin/cases/${ID}`]: () => caseDetail(),
      'GET /ai/settings': () => ({ pricingPolicy: { categories: [] } }),
      'GET /service-types': () => [],
      [`POST /ai/admin/cases/${ID}/assessment`]: () => caseDetail(),
    });
    await renderScreen(<AiCase />);
    const save = await screen.findByTestId('ai-admin-save-edit');
    expect(save).toBeDisabled();
    await fireEvent.press(screen.getByText('4'));
    await fireEvent.changeText(screen.getByTestId('ai-admin-edit-note'), 'Customer reported heat at the isolator');
    await fireEvent.press(screen.getByTestId('ai-admin-save-edit'));
    await waitFor(() => expect(m.find('POST', `/ai/admin/cases/${ID}/assessment`)).toHaveLength(1));
    expect(m.find('POST', `/ai/admin/cases/${ID}/assessment`)[0]!.body).toMatchObject({ severity: 4, note: 'Customer reported heat at the isolator' });
  });

  it('lists knowledge entries with approval state', async () => {
    signInAs('ADMIN_OFFICE');
    mockApi({
      'GET /ai/knowledge': () => paged([{ id: 'k1', title: 'Pool pump stops intermittently', serviceCategory: 'FAULT_FINDING', problemSummary: 'Pool pump stops running.', symptoms: [], severity: 2, pricingContext: null, recommendedResponse: 'Book fault finding.', clarifyingQuestions: [], keywords: ['pool'], status: 'APPROVED', active: true, version: 1, sourceConversationId: ID, sourceReference: 'AIQ-001001', sourceAssessmentId: null, createdByName: 'Olive Admin', approvedByName: 'Olive Admin', approvedAt: '2026-10-04T10:00:00Z', timesRetrieved: 3, createdAt: '', updatedAt: '' }]),
    });
    await renderScreen(<AiKnowledgeList />);
    expect(await screen.findByText('Pool pump stops intermittently')).toBeOnTheScreen();
    expect(screen.getByText(/Approved by Olive Admin/)).toBeOnTheScreen();
    expect(screen.getByText(/used 3×/)).toBeOnTheScreen();
  });
});

describe('owner: AI Assistant settings', () => {
  const settings = (): AiSettingsDto => ({
    settings: { featureEnabled: true, providerMode: 'ENV_DEFAULT', modelName: '', maxClarificationRounds: 3, proposalConfidenceThreshold: 80, reviewConfidenceThreshold: 60, escalateSeverityAtOrAbove: 4, requireAdminApprovalForAllProposals: false, knowledgeRetrievalCount: 3, officeAdminCanApproveKnowledge: true, pricingTolerancePct: 40, maxImagesPerConversation: 8, reviewAgeingHours: 4 },
    settingsVersion: 1, severityPolicy: { levels: [], additionalSafetyRules: [], businessHours: { timezone: 'Africa/Johannesburg', days: [1], start: '07:00', end: '17:00' }, outOfHoursNotice: 'x'.repeat(12) }, severityPolicyVersion: 1,
    pricingPolicy: { labourRatePerHour: 650, afterHoursMultiplier: 1.5, afterHoursCalloutSurcharge: 650, urgencyUpliftPct: [0, 0, 10, 25, 25], materialMarkupPct: 20, globalMinimum: 450, globalMaximum: 2500000, roundTo: 50, includeVat: true, categories: [] }, pricingPolicyVersion: 1,
    coreSafetyRules: [{ code: 'SMOKE', label: 'Smoke', keywords: ['smoke'], minSeverity: 5 }], promptVersion: 'smartquote-2026-10-04.1',
    provider: { name: 'mock', model: 'hydra-dev-simulation-1', configured: true, simulation: true, supportsImages: false, envEnabled: true, apiKey: 'Not configured' }, canEdit: true,
  });

  it('is owner-only in the UI (office admins see the gate; the API also enforces it)', async () => {
    signInAs('ADMIN_OFFICE');
    const m = mockApi({ 'GET /ai/settings': () => settings() });
    await renderScreen(<AiSettingsScreen />);
    expect(await screen.findByText('Owner / manager access only')).toBeOnTheScreen();
    expect(m.find('GET', '/ai/settings')).toHaveLength(0);
  });

  it('shows provider status without secrets and saves a new settings version', async () => {
    signInAs('ADMIN_OWNER');
    const m = mockApi({ 'GET /ai/settings': () => settings(), 'PUT /ai/settings': (c) => ({ ...settings(), settings: (c.body as { settings: AiSettingsDto['settings'] }).settings, settingsVersion: 2 }) });
    await renderScreen(<AiSettingsScreen />);
    expect(await screen.findByTestId('ai-provider-status')).toHaveTextContent(/Not configured/);
    expect(screen.getByText('DEV SIMULATION')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Smart Quote enabled for customers'));
    await fireEvent.press(screen.getByTestId('ai-settings-save'));
    await waitFor(() => expect(m.find('PUT', '/ai/settings')).toHaveLength(1));
    expect(m.find('PUT', '/ai/settings')[0]!.body).toMatchObject({ settings: { featureEnabled: false, proposalConfidenceThreshold: 80 } });
  });
});

describe('integration points', () => {
  it('routes Smart Quote notifications to the right screen per role', () => {
    expect(routeForNotification('CUSTOMER', { aiCaseId: ID })).toBe(`/customer/ai/${ID}`);
    expect(routeForNotification('CUSTOMER', { aiCaseId: ID, jobId: 'job-1' })).toBe('/customer/job/job-1');
    expect(routeForNotification('ADMIN_OFFICE', { aiCaseId: ID })).toBe(`/admin/ai-case/${ID}`);
  });

  it('electricians see the AI context of an assigned job without pricing', async () => {
    signInAs('EMPLOYEE');
    mockApi({
      'GET /jobs/job-1/ai-assessment': () => ({ assessment: { conversationId: ID, reference: 'AIQ-001001', summary: 'Geyser circuit trips the DB.', serviceCategoryLabel: 'Electrical fault finding', severity: 3, severityName: 'High', safetyFlags: ['Burning smell'], observations: [], attachments: [], estimate: null, acceptedAt: null } }),
    });
    await renderScreen(<JobAiSection jobId="job-1" source="AI_ASSESSMENT" />);
    expect(await screen.findByTestId('job-ai-section')).toHaveTextContent(/Geyser circuit trips the DB/);
    expect(screen.queryByText(/Preliminary estimate accepted/)).toBeNull();
  });

  it('does not fetch AI context for jobs that did not come from Smart Quote', async () => {
    signInAs('EMPLOYEE');
    const m = mockApi({});
    await renderScreen(<JobAiSection jobId="job-2" source="APP" />);
    expect(m.calls).toHaveLength(0);
  });
});
