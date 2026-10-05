/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { Router } from 'express';
import { z } from 'zod';
import {
  acceptAiProposalSchema,
  adminAiAssessmentEditSchema,
  adminAiCloseSchema,
  adminAiConvertSchema,
  adminAiFeedbackSchema,
  adminAiReplySchema,
  adminSendProposalSchema,
  aiAnalyticsQuery,
  aiCaseListQuery,
  aiMessageSchema,
  aiSettingsSchema,
  customerAiFeedbackSchema,
  declineAiProposalSchema,
  idParam,
  knowledgeEntrySchema,
  knowledgeListQuery,
  knowledgeUpdateSchema,
  optionalText,
  paginationQuery,
  pricingPolicySchema,
  requestAiReviewSchema,
  severityPolicySchema,
  startAiConversationSchema,
} from '@hydra/shared';
import { actorFrom, auth } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimits';
import { defineRoute } from '../routes/define';
import * as admin from '../services/aiAdminService';
import * as assistant from '../services/aiAssistantService';

const CUSTOMER = ['CUSTOMER'] as const;
const ADMIN = ['ADMIN_OFFICE', 'ADMIN_OWNER'] as const;
const OWNER = ['ADMIN_OWNER'] as const;
const TAG = 'Smart Quote (AI)';
const note = z.object({ changeNote: optionalText(300) });

/**
 * HYDRA Smart Quote — AI quotation & triage assistant (docs/AI_ASSISTANT.md). Customers own their cases;
 * office admins and the owner run the human review; owner-only configuration. Employees see an AI
 * summary only through an assigned job (`GET /jobs/:id/ai-assessment`).
 */
export function registerAiRoutes(r: Router): void {
  // ---- Customer ---------------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/ai/status', tag: TAG, summary: 'Smart Quote availability, simulation label and limits', access: 'authenticated' },
    () => assistant.aiStatus());

  defineRoute(r, { method: 'post', path: '/ai/conversations', tag: TAG, summary: 'Start a Smart Quote assessment (message + optional photos)', access: CUSTOMER,
    body: startAiConversationSchema, status: 201, idempotent: true, pre: [aiLimiter],
    description: 'The enquiry is saved before the AI runs; provider failures route the case to the admin review queue.' },
    (req, { body }) => assistant.startConversation(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/ai/conversations', tag: TAG, summary: 'My Smart Quote assessments', access: CUSTOMER, query: paginationQuery },
    (req, { query }) => assistant.listConversations(auth(req), query.page, query.pageSize));

  defineRoute(r, { method: 'get', path: '/ai/conversations/:id', tag: TAG, summary: 'One of my assessments (conversation, assessment, proposal)', access: CUSTOMER, params: idParam },
    (req, { params }) => assistant.getConversation(auth(req), params.id));

  defineRoute(r, { method: 'post', path: '/ai/conversations/:id/messages', tag: TAG, summary: 'Reply / add information or photos', access: CUSTOMER, params: idParam,
    body: aiMessageSchema, idempotent: true, pre: [aiLimiter] },
    (req, { params, body }) => assistant.sendMessage(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/conversations/:id/accept', tag: TAG, summary: 'Accept the preliminary proposal (creates a REQUESTED service request)', access: CUSTOMER,
    params: idParam, body: acceptAiProposalSchema, idempotent: true },
    (req, { params, body }) => assistant.acceptProposal(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/conversations/:id/decline', tag: TAG, summary: 'Decline the preliminary proposal', access: CUSTOMER, params: idParam, body: declineAiProposalSchema, idempotent: true },
    (req, { params, body }) => assistant.declineProposal(auth(req), params.id, body.reason, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/conversations/:id/request-review', tag: TAG, summary: 'Ask for a person to review this case', access: CUSTOMER, params: idParam, body: requestAiReviewSchema, idempotent: true },
    (req, { params, body }) => assistant.requestReview(auth(req), params.id, body.note, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/conversations/:id/feedback', tag: TAG, summary: '"Was the AI assessment helpful?" (after service completion)', access: CUSTOMER, params: idParam, body: customerAiFeedbackSchema },
    (req, { params, body }) => assistant.customerFeedback(auth(req), params.id, body, actorFrom(req)));

  // ---- Admin review queue -------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/ai/admin/summary', tag: TAG, summary: 'Review queue counts (needs review, urgent, critical…)', access: ADMIN },
    () => admin.queueSummary());

  defineRoute(r, { method: 'get', path: '/ai/admin/cases', tag: TAG, summary: 'AI review queue', access: ADMIN, query: aiCaseListQuery },
    (_req, { query }) => admin.listCases(query));

  defineRoute(r, { method: 'get', path: '/ai/admin/cases/:id', tag: TAG, summary: 'AI case: conversation, images, assessments, price calculation, audit', access: ADMIN, params: idParam },
    (_req, { params }) => admin.getCase(params.id));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/reply', tag: TAG, summary: 'Reply as the PSG Electrical team (or request information)', access: ADMIN, params: idParam, body: adminAiReplySchema, idempotent: true },
    (req, { params, body }) => admin.reply(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/assessment', tag: TAG, summary: 'Edit assessment: summary, category, severity, price range (new version)', access: ADMIN, params: idParam, body: adminAiAssessmentEditSchema },
    (req, { params, body }) => admin.editAssessment(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/proposal', tag: TAG, summary: 'Approve the AI response / send the proposal to the customer', access: ADMIN, params: idParam, body: adminSendProposalSchema, idempotent: true },
    (req, { params, body }) => admin.sendProposal(auth(req), params.id, body.message, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/convert', tag: TAG, summary: 'Convert the case into a REQUESTED job', access: ADMIN, params: idParam, body: adminAiConvertSchema, status: 201, idempotent: true },
    (req, { params, body }) => admin.convertCase(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/close', tag: TAG, summary: 'Close the case', access: ADMIN, params: idParam, body: adminAiCloseSchema, idempotent: true },
    (req, { params, body }) => admin.closeCase(auth(req), params.id, body.reason, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/feedback', tag: TAG, summary: 'Rate the AI assessment, severity and price (analytics only)', access: ADMIN, params: idParam, body: adminAiFeedbackSchema },
    (req, { params, body }) => admin.adminFeedback(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/admin/cases/:id/knowledge', tag: TAG, summary: 'Approve the resolution as AI knowledge', access: ADMIN, params: idParam,
    body: knowledgeEntrySchema.omit({ sourceConversationId: true }), status: 201, idempotent: true },
    (req, { params, body }) => admin.createKnowledgeFromCase(auth(req), params.id, { ...body, sourceConversationId: params.id }, actorFrom(req)));

  // ---- Knowledge management -----------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/ai/knowledge', tag: TAG, summary: 'Approved knowledge entries (search / filter)', access: ADMIN, query: knowledgeListQuery },
    (_req, { query }) => admin.listKnowledge(query));

  defineRoute(r, { method: 'post', path: '/ai/knowledge', tag: TAG, summary: 'Create a knowledge entry', access: ADMIN, body: knowledgeEntrySchema, status: 201, idempotent: true },
    (req, { body }) => admin.createKnowledge(auth(req), body, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/ai/knowledge/:id', tag: TAG, summary: 'Knowledge entry with revision history', access: ADMIN, params: idParam },
    (_req, { params }) => admin.getKnowledge(params.id));

  defineRoute(r, { method: 'patch', path: '/ai/knowledge/:id', tag: TAG, summary: 'Edit a knowledge entry (new version)', access: ADMIN, params: idParam, body: knowledgeUpdateSchema },
    (req, { params, body }) => admin.updateKnowledge(auth(req), params.id, body, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/knowledge/:id/approve', tag: TAG, summary: 'Approve a pending entry (owner, or office when allowed)', access: ADMIN, params: idParam },
    (req, { params }) => admin.approveKnowledge(auth(req), params.id, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/knowledge/:id/active', tag: TAG, summary: 'Activate / deactivate an entry for retrieval', access: ADMIN, params: idParam, body: z.object({ active: z.boolean() }).strict() },
    (req, { params, body }) => admin.setKnowledgeActive(auth(req), params.id, body.active, actorFrom(req)));

  defineRoute(r, { method: 'post', path: '/ai/knowledge/:id/archive', tag: TAG, summary: 'Archive an entry', access: OWNER, params: idParam },
    (req, { params }) => admin.archiveKnowledge(params.id, actorFrom(req)));

  defineRoute(r, { method: 'delete', path: '/ai/knowledge/:id', tag: TAG, summary: 'Delete an entry permanently', access: OWNER, params: idParam },
    (req, { params }) => admin.deleteKnowledge(params.id, actorFrom(req)));

  // ---- Owner configuration ---------------------------------------------------------------------------------
  defineRoute(r, { method: 'get', path: '/ai/settings', tag: TAG, summary: 'AI settings, severity & pricing policies, provider status (no secrets)', access: ADMIN },
    (req) => admin.getAiSettings(auth(req)));

  defineRoute(r, { method: 'put', path: '/ai/settings', tag: TAG, summary: 'Update AI settings (new version)', access: OWNER, body: note.extend({ settings: aiSettingsSchema }).strict() },
    (req, { body }) => admin.updateAiSettings(auth(req), body.settings, body.changeNote, actorFrom(req)));

  defineRoute(r, { method: 'put', path: '/ai/policies/severity', tag: TAG, summary: 'Update severity rules & response targets (new version)', access: OWNER, body: note.extend({ policy: severityPolicySchema }).strict() },
    (req, { body }) => admin.updateSeverityPolicy(auth(req), body.policy, body.changeNote, actorFrom(req)));

  defineRoute(r, { method: 'put', path: '/ai/policies/pricing', tag: TAG, summary: 'Update pricing rules (new version)', access: OWNER, body: note.extend({ policy: pricingPolicySchema }).strict() },
    (req, { body }) => admin.updatePricingPolicy(auth(req), body.policy, body.changeNote, actorFrom(req)));

  defineRoute(r, { method: 'get', path: '/ai/policies/:kind/versions', tag: TAG, summary: 'Policy version history', access: ADMIN, params: z.object({ kind: z.enum(['SETTINGS', 'SEVERITY', 'PRICING']) }) },
    (_req, { params }) => admin.policyVersions(params.kind));

  defineRoute(r, { method: 'get', path: '/ai/analytics', tag: TAG, summary: 'Smart Quote analytics from stored data', access: ADMIN, query: aiAnalyticsQuery },
    (_req, { query }) => admin.analytics(query));

  // ---- Job view (assigned electrician / owner customer / admins) -----------------------------------------
  defineRoute(r, { method: 'get', path: '/jobs/:id/ai-assessment', tag: TAG, summary: 'AI assessment behind a job (null when the job did not come from Smart Quote)', access: 'authenticated', params: idParam },
    async (req, { params }) => ({ assessment: await admin.jobAiSummary(auth(req), params.id) }));
}
