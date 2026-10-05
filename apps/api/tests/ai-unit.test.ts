/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import { describe, expect, it } from 'vitest';
import { aiSettingsSchema, pricingPolicySchema, severityPolicySchema } from '@hydra/shared';
import { loadConfig } from '../src/config/env';
import {
  adjustConfidence,
  calculateEstimate,
  classifyCategory,
  decide,
  detectSafetyTriggers,
  deviatesFromHistory,
  historicalReference,
  imageSafetyFloor,
  isWithinBusinessHours,
  priceSpreadPoor,
  resolveCategory,
  resolveSeverity,
  responseWindow,
  type DecisionInputs,
} from '../src/ai/engine';
import { extractJsonObject, parseProviderOutput } from '../src/ai/parse';
import { DEFAULT_AI_SETTINGS, DEFAULT_PRICING_POLICY, DEFAULT_SEVERITY_POLICY } from '../src/ai/policies';
import { MockAiProvider } from '../src/ai/providers/mock';
import type { AiCaseInput } from '../src/ai/providers/types';
import { extractKeywords, findPhrases, isUnsafeInstruction, redactPii, stripUnsafeSentences } from '../src/ai/text';
import { lightStem, scoreKnowledge } from '../src/repositories/aiKnowledgeRepository';

const cat = (code: string) => DEFAULT_PRICING_POLICY.categories.find((c) => c.code === code)!;

describe('Smart Quote default policies', () => {
  it('validate against their own schemas (owner edits use the same validation)', () => {
    expect(aiSettingsSchema.safeParse(DEFAULT_AI_SETTINGS).success).toBe(true);
    expect(severityPolicySchema.safeParse(DEFAULT_SEVERITY_POLICY).success).toBe(true);
    expect(pricingPolicySchema.safeParse(DEFAULT_PRICING_POLICY).success).toBe(true);
  });
  it('refuse a severity policy where severity 5 does not escalate or levels are out of order', () => {
    const levels = DEFAULT_SEVERITY_POLICY.levels.map((l) => ({ ...l }));
    levels[4] = { ...levels[4]!, adminApprovalRequired: false };
    expect(severityPolicySchema.safeParse({ ...DEFAULT_SEVERITY_POLICY, levels }).success).toBe(false);
    expect(severityPolicySchema.safeParse({ ...DEFAULT_SEVERITY_POLICY, levels: [...DEFAULT_SEVERITY_POLICY.levels].reverse() }).success).toBe(false);
  });
  it('refuse settings where the review threshold is not below the proposal threshold', () => {
    expect(aiSettingsSchema.safeParse({ ...DEFAULT_AI_SETTINGS, reviewConfidenceThreshold: 85 }).success).toBe(false);
  });
  it('refuse duplicate pricing category codes', () => {
    expect(pricingPolicySchema.safeParse({ ...DEFAULT_PRICING_POLICY, categories: [cat('LIGHTING'), cat('LIGHTING')] }).success).toBe(false);
  });
});

describe('safety rule engine (deterministic, independent of the AI)', () => {
  it('detects critical hazards and sets a severity floor of 5', () => {
    const r = detectSafetyTriggers('There is smoke coming out of the DB and I can see exposed wires');
    expect(r.floor).toBe(5);
    expect(r.triggers.map((t) => t.code)).toEqual(expect.arrayContaining(['SMOKE', 'EXPOSED_LIVE_CONDUCTOR']));
  });
  it('detects urgent hazards (sparking, burning smell, swollen battery) as severity 4', () => {
    expect(detectSafetyTriggers('The plug was sparking last night').floor).toBe(4);
    expect(detectSafetyTriggers('There is a burning smell near the board').floor).toBe(4);
    expect(detectSafetyTriggers('My inverter battery is swollen').floor).toBe(4);
    expect(detectSafetyTriggers('battery fire in the garage').floor).toBe(5);
  });
  it('ignores negated mentions but records them for the admin view', () => {
    const r = detectSafetyTriggers('No burning smell and no sparks, it just trips.');
    expect(r.floor).toBeNull();
    expect(r.triggers.every((t) => t.negated)).toBe(true);
  });
  it('does not carry negation across a clause boundary', () => {
    expect(detectSafetyTriggers('No smell, but there were sparks').floor).toBe(4);
  });
  it('applies owner-added rules', () => {
    const extra = [{ code: 'GAS_NEARBY', label: 'Gas nearby', keywords: ['gas leak'], minSeverity: 5 }];
    expect(detectSafetyTriggers('possible gas leak near the DB', extra).floor).toBe(5);
  });
  it('raises severity from image findings', () => {
    expect(imageSafetyFloor(['visible burn marks on breaker'])).toBe(4);
    expect(imageSafetyFloor(['exposed conductor visible'])).toBe(5);
    expect(imageSafetyFloor(['arcing visible on the terminal'])).toBe(5);
    expect(imageSafetyFloor(['searching the board'])).toBeNull(); // "arc" only as a whole word
    expect(imageSafetyFloor(['tidy installation'])).toBeNull();
  });
});

describe('severity resolution', () => {
  it('never lets the AI lower a rule-based severity', () => {
    expect(resolveSeverity(1, 2, 5)).toBe(5);
    expect(resolveSeverity(2, 3, 4)).toBe(4);
  });
  it('uses the AI suggestion when it is higher, and the category default when there is no AI', () => {
    expect(resolveSeverity(3, 1, null)).toBe(3);
    expect(resolveSeverity(null, 2, null)).toBe(2);
  });
});

describe('service classification', () => {
  it('maps customer language to canonical HYDRA categories', () => {
    expect(classifyCategory('My DB keeps tripping whenever I turn the geyser on', DEFAULT_PRICING_POLICY.categories).category.code).toBe('FAULT_FINDING');
    expect(classifyCategory('No hot water, the geyser element might be broken', DEFAULT_PRICING_POLICY.categories).category.code).toBe('GEYSER_ELECTRICAL');
    expect(classifyCategory('Solar inverter beeping with an error code', DEFAULT_PRICING_POLICY.categories).category.code).toBe('INVERTER');
    expect(classifyCategory('I need a certificate of compliance to sell my house', DEFAULT_PRICING_POLICY.categories).category.code).toBe('COC_INSPECTION');
  });
  it('falls back to OTHER (unsupported) when nothing matches', () => {
    const r = classifyCategory('Something odd is happening with my pool pump timer', DEFAULT_PRICING_POLICY.categories);
    expect(r.category.code).toBe('OTHER');
    expect(r.category.supported).toBe(false);
  });
  it('resolves AI category strings by code or label, rejecting unknown ones', () => {
    expect(resolveCategory('fault finding', DEFAULT_PRICING_POLICY.categories)?.code).toBe('FAULT_FINDING');
    expect(resolveCategory('Lighting', DEFAULT_PRICING_POLICY.categories)?.code).toBe('LIGHTING');
    expect(resolveCategory('QUANTUM_REPAIR', DEFAULT_PRICING_POLICY.categories)).toBeNull();
  });
});

describe('pricing engine (server-calculated ranges)', () => {
  const base = { severity: 3, afterHours: false, vatRate: 0.15, unitCosts: new Map([['BRK-MCB-20A', { name: 'MCB 20A', unitCost: 89.9 }]]) };

  it('calculates a structured range with all components', () => {
    const p = calculateEstimate(DEFAULT_PRICING_POLICY, { ...base, category: cat('FAULT_FINDING'), suggestedHours: { min: 1, max: 2 } });
    expect(p.min).toBeGreaterThan(0);
    expect(p.max).toBeGreaterThanOrEqual(p.min);
    expect(p.min % 50).toBe(0);
    expect(p.callout).toBeGreaterThan(0);
    expect(p.urgencyMin).toBeGreaterThan(0); // severity 3 uplift
    expect(p.basis.join(' ')).toMatch(/Includes VAT/);
    expect(p.basis.join(' ')).toMatch(/MCB 20A/);
    expect(p.inputsOutOfRange).toBe(false);
  });
  it('clamps absurd AI labour inputs and flags them', () => {
    const p = calculateEstimate(DEFAULT_PRICING_POLICY, { ...base, category: cat('LIGHTING'), suggestedHours: { min: 0.1, max: 400 } });
    expect(p.inputsOutOfRange).toBe(true);
    expect(p.clamped).toBe(true);
    expect(p.hoursUsed).toEqual({ min: cat('LIGHTING').labourHours.min, max: cat('LIGHTING').labourHours.max });
    expect(p.max).toBeLessThanOrEqual(cat('LIGHTING').priceCeiling);
  });
  it('keeps every estimate within the category floor/ceiling and global limits', () => {
    for (const c of DEFAULT_PRICING_POLICY.categories) {
      const p = calculateEstimate(DEFAULT_PRICING_POLICY, { ...base, category: c, suggestedHours: null });
      expect(p.min).toBeGreaterThanOrEqual(Math.floor(Math.max(c.priceFloor, DEFAULT_PRICING_POLICY.globalMinimum) / 50) * 50);
      expect(p.max).toBeLessThanOrEqual(Math.min(c.priceCeiling, DEFAULT_PRICING_POLICY.globalMaximum));
    }
  });
  it('applies after-hours rates and surcharge', () => {
    const day = calculateEstimate(DEFAULT_PRICING_POLICY, { ...base, category: cat('FAULT_FINDING'), suggestedHours: null });
    const night = calculateEstimate(DEFAULT_PRICING_POLICY, { ...base, category: cat('FAULT_FINDING'), suggestedHours: null, afterHours: true });
    expect(night.labourMin).toBeGreaterThan(day.labourMin);
    expect(night.callout).toBeGreaterThan(day.callout);
  });
  it('flags ranges that are too wide to present', () => {
    expect(priceSpreadPoor(1000, 5000)).toBe(true);
    expect(priceSpreadPoor(1000, 3000)).toBe(false);
  });
});

describe('historical price reference', () => {
  it('needs at least 5 samples and removes outliers', () => {
    expect(historicalReference([1000, 1200, 1100])).toBeNull();
    const ref = historicalReference([1000, 1100, 1200, 1150, 1050, 90000])!;
    expect(ref.sampleSize).toBe(5);
    expect(ref.median).toBe(1100);
  });
  it('reports deviation beyond tolerance but never sets prices', () => {
    const ref = { sampleSize: 6, median: 2000, p25: 1800, p75: 2200 };
    expect(deviatesFromHistory(ref, 4000, 6000, 40)).toBe(true);
    expect(deviatesFromHistory(ref, 1800, 2400, 40)).toBe(false);
    expect(deviatesFromHistory(null, 1, 2, 40)).toBe(false);
  });
});

describe('confidence and escalation decision', () => {
  const d = (over: Partial<DecisionInputs> = {}): DecisionInputs => ({
    settings: DEFAULT_AI_SETTINGS, severityPolicy: DEFAULT_SEVERITY_POLICY, finalSeverity: 2, confidence: 85, safetyTriggered: false,
    needsMoreInformation: false, clarificationRoundsUsed: 0, supportedCategory: true, imageUnclear: false, conflicting: false,
    priceInputsOutOfRange: false, priceSpreadPoor: false, historicalDeviation: false, aiRequestedReview: false, unsafeOutput: false,
    humanRequested: false, providerFailed: false, malformed: false, ...over,
  });

  it('adjusts model confidence with objective signals', () => {
    expect(adjustConfidence({ aiConfidence: 85, imageUnclear: true, conflicting: false, categoryDisagrees: false, priceClamped: false, knowledgeMatched: false })).toBe(70);
    expect(adjustConfidence({ aiConfidence: 98, imageUnclear: false, conflicting: false, categoryDisagrees: false, priceClamped: false, knowledgeMatched: true })).toBe(100);
  });
  it('80–100 → preliminary proposal', () => {
    expect(decide(d()).outcome).toBe('PROPOSAL');
  });
  it('60–79 → proposal with review recommended', () => {
    const r = decide(d({ confidence: 70 }));
    expect(r.outcome).toBe('PROPOSAL_REVIEW_RECOMMENDED');
    expect(r.requiresAdminReview).toBe(true);
  });
  it('below 60 → admin review (no confident proposal)', () => {
    const r = decide(d({ confidence: 40 }));
    expect(r.outcome).toBe('ADMIN_REVIEW');
    expect(r.reasons).toContain('LOW_CONFIDENCE');
  });
  it('severity 4 forces admin review even at high confidence', () => {
    const r = decide(d({ finalSeverity: 4, confidence: 99 }));
    expect(r.outcome).toBe('ADMIN_REVIEW');
    expect(r.reasons).toContain('HIGH_SEVERITY');
  });
  it('severity 5 is a safety escalation, never a clarification round', () => {
    const r = decide(d({ finalSeverity: 5, needsMoreInformation: true, safetyTriggered: true }));
    expect(r.outcome).toBe('SAFETY_ESCALATION');
    expect(r.reasons).toEqual(expect.arrayContaining(['CRITICAL_SAFETY', 'SAFETY_TRIGGER']));
  });
  it('asks clarifying questions while rounds remain and nothing is dangerous', () => {
    expect(decide(d({ needsMoreInformation: true, confidence: 50 })).outcome).toBe('NEEDS_INFORMATION');
  });
  it('stops asking at the configured limit (no endless interrogation)', () => {
    const r = decide(d({ needsMoreInformation: true, clarificationRoundsUsed: DEFAULT_AI_SETTINGS.maxClarificationRounds }));
    expect(r.outcome).toBe('ADMIN_REVIEW');
    expect(r.reasons).toContain('MAX_CLARIFICATIONS_REACHED');
  });
  it('forces review for provider failure, unsupported category, unclear images, conflicts, a person request and policy', () => {
    expect(decide(d({ providerFailed: true })).reasons).toContain('PROVIDER_UNAVAILABLE');
    expect(decide(d({ supportedCategory: false })).reasons).toContain('UNSUPPORTED_CATEGORY');
    expect(decide(d({ imageUnclear: true })).reasons).toContain('IMAGE_UNCLEAR');
    expect(decide(d({ conflicting: true })).reasons).toContain('CONFLICTING_INFORMATION');
    expect(decide(d({ humanRequested: true })).reasons).toContain('CUSTOMER_REQUESTED_HUMAN');
    expect(decide(d({ priceSpreadPoor: true })).reasons).toContain('PRICE_CONFIDENCE_POOR');
    expect(decide(d({ settings: { ...DEFAULT_AI_SETTINGS, requireAdminApprovalForAllProposals: true } })).reasons).toContain('POLICY_REQUIRES_APPROVAL');
  });
  it('hard reasons skip clarification and go straight to a person', () => {
    expect(decide(d({ needsMoreInformation: true, providerFailed: true })).outcome).toBe('ADMIN_REVIEW');
    expect(decide(d({ needsMoreInformation: true, aiRequestedReview: true })).outcome).toBe('ADMIN_REVIEW');
  });
});

describe('response window wording', () => {
  it('never promises an arrival time and adds an out-of-hours notice for urgent cases', () => {
    const sundayNight = new Date('2026-10-04T21:00:00+02:00');
    const rw = responseWindow(DEFAULT_SEVERITY_POLICY, 3, sundayNight);
    expect(rw.wording).toMatch(/subject to technician availability/);
    expect(rw.wording).not.toMatch(/will arrive/i);
    expect(rw.outOfHoursNotice).toBeTruthy();
    expect(responseWindow(DEFAULT_SEVERITY_POLICY, 1, sundayNight).outOfHoursNotice).toBeNull();
  });
  it('knows business hours in the business timezone', () => {
    expect(isWithinBusinessHours(DEFAULT_SEVERITY_POLICY.businessHours, new Date('2026-10-05T09:30:00+02:00'))).toBe(true);
    expect(isWithinBusinessHours(DEFAULT_SEVERITY_POLICY.businessHours, new Date('2026-10-05T18:30:00+02:00'))).toBe(false);
  });
});

describe('structured output validation', () => {
  const valid = {
    summary: 'Breaker trips when geyser is switched on.', serviceCategory: 'FAULT_FINDING', severity: 3, severityReason: 'Repeated tripping',
    observations: [], clarifyingQuestions: [], needsMoreInformation: false, estimatedLabourHours: { min: 1, max: 2 }, suggestedPricingFactors: [],
    confidence: 82, requiresAdminReview: false, adminReviewReason: null, safetyFlags: [], imageFindings: { status: 'NOT_PROVIDED', notes: [] },
    conflictingInformation: false,
  };
  it('accepts a valid response', () => {
    const r = parseProviderOutput(JSON.stringify(valid));
    expect(r.ok && r.data.confidence).toBe(82);
  });
  it('repairs code fences, snake_case keys and 0–1 confidence', () => {
    const raw = '```json\n' + JSON.stringify({ ...valid, confidence: 0.82, clarifying_questions: 'Does the main switch trip?', clarifyingQuestions: undefined }) + '\n```';
    const r = parseProviderOutput(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.repaired).toBe(true);
      expect(r.data.confidence).toBe(82);
      expect(r.data.clarifyingQuestions).toEqual(['Does the main switch trip?']);
    }
  });
  it('rejects malformed or invalid responses', () => {
    expect(parseProviderOutput('{"summary": "x", "severity": "very high", "confidence": ').ok).toBe(false);
    expect(parseProviderOutput(JSON.stringify({ ...valid, severity: 9 })).ok).toBe(false);
    expect(parseProviderOutput('I cannot help with that').ok).toBe(false);
  });
  it('extracts the first balanced JSON object', () => {
    expect(extractJsonObject('Here: {"a": "}", "b": {"c": 1}} trailing')).toBe('{"a": "}", "b": {"c": 1}}');
  });
});

describe('unsafe (DIY) output filter', () => {
  it('detects repair instructions', () => {
    expect(isUnsafeInstruction('You can replace the breaker yourself with a 20A MCB.')).toBe(true);
    expect(isUnsafeInstruction('Remove the DB cover and check the neutral bar.')).toBe(true);
    expect(isUnsafeInstruction('Step 1: switch off the isolator')).toBe(true);
    expect(isUnsafeInstruction('A technician will need to inspect the geyser circuit.')).toBe(false);
  });
  it('strips unsafe sentences and keeps the rest', () => {
    const r = stripUnsafeSentences('The geyser circuit is likely faulty. You should rewire the isolator. A technician should inspect it.');
    expect(r.removed).toBe(true);
    expect(r.text).toBe('The geyser circuit is likely faulty. A technician should inspect it.');
  });
});

describe('privacy redaction', () => {
  it('removes emails, phone numbers, ID numbers, street addresses and the customer name', () => {
    const out = redactPii('Hi I am Thandi Zulu, call 082 555 1234 or thandi@example.com. ID 9001015009087. 12 Main Road has no power.', ['Thandi', 'Zulu']);
    expect(out).not.toMatch(/Thandi|Zulu|082 555 1234|example\.com|9001015009087|12 Main Road/);
    expect(out).toMatch(/\[CUSTOMER\].*\[PHONE\].*\[EMAIL\].*\[ID_NUMBER\].*\[ADDRESS\]/);
  });
});

describe('text helpers and knowledge scoring', () => {
  it('matches whole phrases only', () => {
    expect(findPhrases('the spark plug', ['spark'])[0]?.negated).toBe(false);
    expect(findPhrases('sparkling water', ['spark'])).toHaveLength(0);
  });
  it('extracts content keywords', () => {
    expect(extractKeywords('My pool pump keeps stopping after a few minutes')).toEqual(['pool', 'pump', 'stopping', 'minutes']);
  });
  it('stems lightly so plurals and tenses meet', () => {
    expect(lightStem('stopping')).toBe(lightStem('stops'));
    expect(lightStem('pumps')).toBe('pump');
  });
  it('scores relevant knowledge higher than unrelated knowledge', () => {
    const pool = { title: 'Pool pump stops intermittently', problemSummary: 'Pool pump stops running', symptoms: ['pump stops'], keywords: ['pool', 'pump'], serviceCategory: 'FAULT_FINDING' };
    const solar = { title: 'Inverter overload alarm', problemSummary: 'Inverter beeps on overload', symptoms: [], keywords: ['inverter'], serviceCategory: 'INVERTER' };
    const q = 'Our pool pump stops after a few minutes';
    expect(scoreKnowledge(q, null, pool)).toBeGreaterThan(0.4);
    expect(scoreKnowledge(q, null, solar)).toBeLessThan(0.1);
  });
});

describe('development mock provider', () => {
  const input = (text: string, over: Partial<AiCaseInput> = {}): AiCaseInput => ({
    promptVersion: 't', systemPrompt: '', userPrompt: '', transcript: [{ role: 'CUSTOMER', text }], images: [],
    context: { propertyType: null, customerUrgency: null, clarificationRoundsUsed: 0, clarificationRoundsRemaining: 3, imageCount: 0 },
    categories: DEFAULT_PRICING_POLICY.categories, knowledge: [], ...over,
  });
  it('is deterministic and asks category-specific questions first', async () => {
    const p = new MockAiProvider();
    const a = await p.analyseCase(input('My DB trips when I turn the geyser on'), new AbortController().signal);
    const b = await p.analyseCase(input('My DB trips when I turn the geyser on'), new AbortController().signal);
    expect(a).toBe(b);
    const parsed = JSON.parse(a);
    expect(parsed.needsMoreInformation).toBe(true);
    expect(parsed.clarifyingQuestions[0]).toMatch(/main breaker/);
  });
  it('never claims to have analysed images', async () => {
    const out = JSON.parse(await new MockAiProvider().analyseCase(input('[mock:confident] light flickers', { context: { propertyType: null, customerUrgency: null, clarificationRoundsUsed: 0, clarificationRoundsRemaining: 3, imageCount: 2 } }), new AbortController().signal));
    expect(out.imageFindings.status).toBe('UNAVAILABLE');
    expect(out.imageFindings.notes[0]).toMatch(/unavailable in this development environment/);
  });
  it('is refused in production configuration', () => {
    const prod = {
      NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), FILE_URL_SIGNING_SECRET: 'c'.repeat(40),
      PAYMENT_PROVIDER: 'paystack', PAYMENT_SECRET_KEY: 'sk', EMAIL_PROVIDER: 'smtp', PUBLIC_API_BASE_URL: 'https://api.example.co.za', DATABASE_SSL: 'true',
    };
    expect(loadConfig(prod).aiProvider).toBe('none');
    expect(() => loadConfig({ ...prod, AI_PROVIDER: 'mock' })).toThrow(/AI_PROVIDER=mock/);
    expect(() => loadConfig({ ...prod, AI_PROVIDER: 'anthropic' })).toThrow(/AI_API_KEY/);
  });
});
