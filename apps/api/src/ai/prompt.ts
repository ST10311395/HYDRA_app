/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import type { PricingCategory, SeverityPolicy } from '@hydra/shared';
import type { RetrievedKnowledgeForPrompt, TranscriptLine } from './providers/types';

/**
 * Prompt construction for real providers (PROMPT_VERSION in policies.ts). The system prompt is stable
 * per policy version; volatile case data goes in the user prompt.
 */
export function buildSystemPrompt(categories: PricingCategory[], severity: SeverityPolicy): string {
  const cats = categories.map((c) => `- ${c.code}: ${c.label}${c.supported ? '' : ' (human review only)'} — typical labour ${c.labourHours.min}–${c.labourHours.max} h`).join('\n');
  const levels = severity.levels.map((l) => `- ${l.level} ${l.name}: ${l.description} e.g. ${l.examples.join('; ')}`).join('\n');
  return `You are the HYDRA Smart Quote assessment assistant for PSG Electrical & Cables / TRITE Solar (South Africa).

Your job is ASSESSMENT, TRIAGE and QUOTATION SUPPORT only: what type of service is probably needed, how serious the problem appears, roughly how much technician labour it may involve, and what extra information PSG needs.

Absolute rules:
- Never give DIY repair, wiring, testing or "how to fix it" instructions. Never tell the customer to open, remove covers from, rewire, bypass, reset internals of, or work on electrical, solar, inverter or battery equipment.
- Never invent facts. If you are unsure, lower your confidence, ask a clarifying question, or set requiresAdminReview.
- Do not state prices. HYDRA calculates prices from its own pricing rules; you only estimate labour hours.
- Do not promise arrival or response times.
- Safety: if the description suggests fire, smoke, shock, exposed live conductors, arcing, water near electrics, or battery overheating/swelling, rate severity 4–5 and add a safety flag.
- Clarifying questions: at most 3 short, useful questions per round, only when they materially change the assessment. When no clarification rounds remain, set needsMoreInformation=false and give your best assessment with an honest confidence.
- Prefer the approved PSG knowledge provided in the user message when it matches; it was written by PSG staff.

Service categories (use the code):
${cats}

Severity scale:
${levels}

Respond with ONE JSON object and nothing else, with exactly these fields:
{"summary": string (≤ 2 sentences, neutral, no personal details),
 "serviceCategory": category code,
 "severity": 1-5,
 "severityReason": string,
 "observations": string[] (facts from the description/images),
 "clarifyingQuestions": string[] (0-3),
 "needsMoreInformation": boolean,
 "estimatedLabourHours": {"min": number, "max": number} | null,
 "suggestedPricingFactors": string[],
 "confidence": 0-100,
 "requiresAdminReview": boolean,
 "adminReviewReason": string | null,
 "safetyFlags": string[],
 "imageFindings": {"status": "ANALYSED"|"UNCLEAR"|"NOT_PROVIDED"|"UNAVAILABLE", "notes": string[]},
 "conflictingInformation": boolean}`;
}

export function buildUserPrompt(input: {
  transcript: TranscriptLine[];
  propertyType: string | null;
  customerUrgency: string | null;
  roundsUsed: number;
  roundsRemaining: number;
  imageCount: number;
  imagesSent: boolean;
  knowledge: RetrievedKnowledgeForPrompt[];
}): string {
  const knowledge = input.knowledge.length
    ? input.knowledge
        .map((k, i) => `[K${i + 1}] ${k.title} (category ${k.serviceCategory}, severity ${k.severity})\nProblem: ${k.problemSummary}\nSymptoms: ${k.symptoms.join('; ') || '—'}\nApproved guidance: ${k.recommendedResponse}${k.pricingContext ? `\nPricing context: ${k.pricingContext}` : ''}`)
        .join('\n\n')
    : 'None matched.';
  const lines = input.transcript.map((t) => `${t.role === 'TEAM' ? 'PSG team' : t.role === 'ASSISTANT' ? 'Assistant' : 'Customer'}: ${t.text}`).join('\n');
  return `Case context:
- Property type: ${input.propertyType ?? 'not stated'}
- Customer-stated urgency: ${input.customerUrgency ?? 'not stated'}
- Clarification rounds used: ${input.roundsUsed}; remaining: ${input.roundsRemaining}
- Photos attached: ${input.imageCount}${input.imageCount && !input.imagesSent ? ' (not available to you — set imageFindings.status to UNAVAILABLE)' : ''}

Approved PSG knowledge:
${knowledge}

Conversation (personal details redacted):
${lines}`;
}
