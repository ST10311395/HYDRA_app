import type {
  AiEscalationReason,
  AiOutcome,
  AiPriceDto,
  AiResponseWindowDto,
  AiSafetyTriggerDto,
  AiSettings,
  PricingCategory,
  PricingPolicy,
  SafetyRule,
  SeverityPolicy,
} from '@hydra/shared';
import { CORE_SAFETY_RULES } from './policies';
import { findPhrases } from './text';

/**
 * Deterministic Smart Quote business rules. The AI provider's output is an *input* to these functions;
 * it can never lower a rule-based severity, bypass escalation, or set a displayed price.
 */

// ---- Safety ------------------------------------------------------------------------------------------

export interface SafetyResult {
  triggers: (AiSafetyTriggerDto & { negated: boolean })[];
  /** Highest minimum severity among non-negated triggers, or null. */
  floor: number | null;
}

export function detectSafetyTriggers(text: string, additional: SafetyRule[] = []): SafetyResult {
  const triggers: SafetyResult['triggers'] = [];
  for (const rule of [...CORE_SAFETY_RULES, ...additional]) {
    const hits = findPhrases(text, rule.keywords);
    if (!hits.length) continue;
    const live = hits.find((h) => !h.negated);
    triggers.push({ code: rule.code, label: rule.label, matched: (live ?? hits[0]!).phrase, minSeverity: rule.minSeverity, negated: !live });
  }
  const active = triggers.filter((t) => !t.negated);
  return { triggers, floor: active.length ? Math.max(...active.map((t) => t.minSeverity)) : null };
}

/** Image findings reported by a multimodal provider can also raise the floor (never lower it). */
export function imageSafetyFloor(flags: string[]): number | null {
  const text = flags.join(' ').toLowerCase();
  if (/(fire|smoke|\barc(ing)?\b|exposed (live )?(conductor|wire)|burn(ed|t)? (damage|marks)|scorch|charred|melted|thermal|swollen|bulging)/.test(text)) {
    return /(fire|smoke|exposed|thermal|\barc(ing)?\b)/.test(text) ? 5 : 4;
  }
  return null;
}

// ---- Classification ----------------------------------------------------------------------------------

export interface Classification {
  category: PricingCategory;
  score: number;
  matched: string[];
}

/** Maps customer language to a canonical category by weighted keyword matches (ties: policy order). */
export function classifyCategory(text: string, categories: PricingCategory[]): Classification {
  const fallback = categories.find((c) => c.code === 'OTHER') ?? categories[categories.length - 1]!;
  let best: Classification = { category: fallback, score: 0, matched: [] };
  for (const cat of categories) {
    const hits = findPhrases(text, cat.keywords).filter((h) => !h.negated);
    const score = hits.reduce((s, h) => s + h.phrase.split(' ').length, 0);
    if (score > best.score) best = { category: cat, score, matched: hits.map((h) => h.phrase) };
  }
  return best;
}

export function resolveCategory(code: string | null | undefined, categories: PricingCategory[]): PricingCategory | null {
  if (!code) return null;
  const c = code.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return categories.find((x) => x.code === c) ?? categories.find((x) => x.label.toLowerCase() === code.trim().toLowerCase()) ?? null;
}

// ---- Severity ----------------------------------------------------------------------------------------

/** Final severity = max(AI suggestion or category default, safety floor). Never lowered by the AI. */
export function resolveSeverity(aiSeverity: number | null, categoryDefault: number, floor: number | null): number {
  const base = aiSeverity ?? categoryDefault;
  return Math.min(5, Math.max(1, base, floor ?? 1));
}

// ---- Response window ---------------------------------------------------------------------------------

export function isWithinBusinessHours(policy: SeverityPolicy['businessHours'], now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: policy.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const hhmm = `${get('hour').replace('24', '00')}:${get('minute')}`;
  return policy.days.includes(day) && hhmm >= policy.start && hhmm < policy.end;
}

/**
 * Customer-facing response expectation. Uses policy wording ("target", "subject to technician
 * availability") — never a promised arrival time, because no booking exists yet.
 */
export function responseWindow(policy: SeverityPolicy, severity: number, now = new Date()): AiResponseWindowDto {
  const level = policy.levels[severity - 1]!;
  const outOfHours = severity >= 3 && !isWithinBusinessHours(policy.businessHours, now);
  return {
    severity,
    severityName: level.name,
    targetResponse: level.targetResponse,
    responseWindow: level.responseWindow,
    wording: level.customerWording,
    outOfHoursNotice: outOfHours ? policy.outOfHoursNotice : null,
  };
}

// ---- Pricing -----------------------------------------------------------------------------------------

export interface PricingInputs {
  category: PricingCategory;
  /** AI-suggested labour hours (untrusted); null → category defaults. */
  suggestedHours: { min: number; max: number } | null;
  severity: number;
  afterHours: boolean;
  vatRate: number;
  /** Current inventory unit costs by SKU (existing `materials` table). */
  unitCosts: Map<string, { name: string; unitCost: number }>;
}

export interface PricingResult extends AiPriceDto {
  hoursUsed: { min: number; max: number };
  /** AI inputs were materially outside the category's allowed range (clamped and flagged). */
  inputsOutOfRange: boolean;
}

const zar = (n: number) => `R${Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ')}`;

/** HYDRA pricing engine: structured rules produce the displayed range; the AI only suggests inputs. */
export function calculateEstimate(policy: PricingPolicy, input: PricingInputs): PricingResult {
  const { category: cat } = input;
  const basis: string[] = [];
  let clamped = false;
  let inputsOutOfRange = false;

  let hours = { ...cat.labourHours };
  if (input.suggestedHours) {
    const s = input.suggestedHours;
    inputsOutOfRange = s.min < cat.labourHours.min * 0.5 || s.max > cat.labourHours.max * 1.5;
    const min = Math.min(Math.max(s.min, cat.labourHours.min), cat.labourHours.max);
    const max = Math.min(Math.max(s.max, min), cat.labourHours.max);
    if (min !== s.min || max !== s.max) clamped = true;
    hours = { min, max };
  }

  const rate = policy.labourRatePerHour * (input.afterHours ? policy.afterHoursMultiplier : 1);
  const vat = policy.includeVat ? 1 + input.vatRate : 1;
  const labourMin = hours.min * rate;
  const labourMax = hours.max * rate;
  const upliftPct = policy.urgencyUpliftPct[input.severity - 1] ?? 0;
  const urgencyMin = (labourMin * upliftPct) / 100;
  const urgencyMax = (labourMax * upliftPct) / 100;
  const callout = cat.calloutFee + (input.afterHours ? policy.afterHoursCalloutSurcharge : 0);

  let invMin = 0;
  let invMax = 0;
  const invLines: string[] = [];
  for (const m of cat.typicalMaterials) {
    const item = input.unitCosts.get(m.sku);
    if (!item) continue;
    invMin += m.qtyMin * item.unitCost;
    invMax += m.qtyMax * item.unitCost;
    invLines.push(`${item.name} × ${m.qtyMin}–${m.qtyMax} @ ${zar(item.unitCost)}`);
  }
  const markup = 1 + policy.materialMarkupPct / 100;
  const materialsMin = (cat.materials.min + invMin) * markup;
  const materialsMax = (cat.materials.max + invMax) * markup;

  const serviceMin = callout + labourMin + urgencyMin;
  const serviceMax = callout + labourMax + urgencyMax;
  const lowerBound = Math.max(cat.priceFloor, policy.globalMinimum);
  const upperBound = Math.min(cat.priceCeiling, policy.globalMaximum);
  let totalMin = (serviceMin + materialsMin) * vat;
  let totalMax = (serviceMax + materialsMax) * vat;
  if (totalMin < lowerBound || totalMax > upperBound || totalMax < lowerBound || totalMin > upperBound) clamped = true;
  totalMin = Math.min(Math.max(totalMin, lowerBound), upperBound);
  totalMax = Math.min(Math.max(totalMax, totalMin), upperBound);

  const r = policy.roundTo;
  const down = (n: number) => Math.max(0, Math.floor(n / r) * r);
  const up = (n: number) => Math.ceil(n / r) * r;
  const v = (n: number) => Math.round(n * vat);

  if (callout > 0) basis.push(`Call-out ${zar(callout)}${input.afterHours ? ' (incl. after-hours surcharge)' : ''}`);
  else basis.push('No call-out fee for this service');
  basis.push(`Labour ${hours.min}–${hours.max} h at ${zar(rate)}/h${input.afterHours ? ' (after-hours rate)' : ''}`);
  if (upliftPct > 0) basis.push(`Urgency uplift ${upliftPct}% of labour (severity ${input.severity})`);
  basis.push(`Materials allowance ${zar(cat.materials.min)}–${zar(cat.materials.max)} + ${policy.materialMarkupPct}% handling`);
  for (const l of invLines) basis.push(`Typical stock item: ${l}`);
  if (policy.includeVat) basis.push(`Includes VAT at ${Math.round(input.vatRate * 1000) / 10}%`);
  if (clamped) basis.push('Range adjusted to the configured limits for this service');

  return {
    min: down(totalMin),
    max: Math.max(up(totalMax), down(totalMin)),
    serviceMin: v(serviceMin),
    serviceMax: v(serviceMax),
    labourMin: v(labourMin),
    labourMax: v(labourMax),
    materialsMin: v(materialsMin),
    materialsMax: v(materialsMax),
    callout: v(callout),
    urgencyMin: v(urgencyMin),
    urgencyMax: v(urgencyMax),
    afterHours: input.afterHours,
    includesVat: policy.includeVat,
    basis,
    clamped,
    hoursUsed: hours,
    inputsOutOfRange,
  };
}

// ---- Confidence & decision -----------------------------------------------------------------------------

export interface ConfidenceInputs {
  aiConfidence: number;
  imageUnclear: boolean;
  conflicting: boolean;
  categoryDisagrees: boolean;
  priceClamped: boolean;
  knowledgeMatched: boolean;
}

/** Server-side confidence: the model's self-report adjusted by objective signals, never raised above 100. */
export function adjustConfidence(c: ConfidenceInputs): number {
  let v = c.aiConfidence;
  if (c.imageUnclear) v -= 15;
  if (c.conflicting) v -= 20;
  if (c.categoryDisagrees) v -= 10;
  if (c.priceClamped) v -= 10;
  if (c.knowledgeMatched) v += 5;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export interface DecisionInputs {
  settings: AiSettings;
  severityPolicy: SeverityPolicy;
  finalSeverity: number;
  confidence: number;
  safetyTriggered: boolean;
  needsMoreInformation: boolean;
  clarificationRoundsUsed: number;
  supportedCategory: boolean;
  imageUnclear: boolean;
  conflicting: boolean;
  priceInputsOutOfRange: boolean;
  priceSpreadPoor: boolean;
  historicalDeviation: boolean;
  aiRequestedReview: boolean;
  unsafeOutput: boolean;
  humanRequested: boolean;
  providerFailed: boolean;
  malformed: boolean;
}

export interface Decision {
  outcome: AiOutcome;
  reasons: AiEscalationReason[];
  requiresAdminReview: boolean;
}

/**
 * The escalation policy (docs/AI_ASSISTANT.md §Decision engine). Hard reasons (danger, provider
 * failure, a person was asked for) go straight to a human; softer ones still allow the AI to ask a
 * limited number of clarifying questions first.
 */
export function decide(d: DecisionInputs): Decision {
  const hard: AiEscalationReason[] = [];
  const soft: AiEscalationReason[] = [];
  const level = d.severityPolicy.levels[d.finalSeverity - 1]!;

  if (d.finalSeverity === 5) hard.push('CRITICAL_SAFETY');
  else if (d.finalSeverity >= d.settings.escalateSeverityAtOrAbove || level.escalate) hard.push('HIGH_SEVERITY');
  if (d.safetyTriggered) hard.push('SAFETY_TRIGGER');
  if (d.providerFailed) hard.push('PROVIDER_UNAVAILABLE');
  if (d.malformed) hard.push('MALFORMED_AI_RESPONSE');
  if (d.unsafeOutput) hard.push('UNSAFE_AI_OUTPUT');
  if (d.humanRequested) hard.push('CUSTOMER_REQUESTED_HUMAN');
  if (d.aiRequestedReview) hard.push('AI_REQUESTED_REVIEW');

  if (!d.supportedCategory) soft.push('UNSUPPORTED_CATEGORY');
  if (d.imageUnclear) soft.push('IMAGE_UNCLEAR');
  if (d.conflicting) soft.push('CONFLICTING_INFORMATION');
  if (d.priceInputsOutOfRange) soft.push('PRICE_INPUTS_OUT_OF_RANGE');
  if (d.priceSpreadPoor) soft.push('PRICE_CONFIDENCE_POOR');
  if (d.historicalDeviation) soft.push('HISTORICAL_PRICE_DEVIATION');
  if (d.confidence < d.settings.reviewConfidenceThreshold) soft.push('LOW_CONFIDENCE');

  const unique = (r: AiEscalationReason[]) => [...new Set(r)];

  if (d.finalSeverity === 5) return { outcome: 'SAFETY_ESCALATION', reasons: unique([...hard, ...soft]), requiresAdminReview: true };

  const roundsLeft = d.clarificationRoundsUsed < d.settings.maxClarificationRounds;
  if (hard.length === 0 && d.needsMoreInformation && roundsLeft) {
    return { outcome: 'NEEDS_INFORMATION', reasons: [], requiresAdminReview: false };
  }
  if (d.needsMoreInformation && !roundsLeft) soft.push('MAX_CLARIFICATIONS_REACHED');

  if (level.adminApprovalRequired || d.settings.requireAdminApprovalForAllProposals) hard.push('POLICY_REQUIRES_APPROVAL');

  if (hard.length || soft.length) return { outcome: 'ADMIN_REVIEW', reasons: unique([...hard, ...soft]), requiresAdminReview: true };
  if (d.confidence < d.settings.proposalConfidenceThreshold) {
    return { outcome: 'PROPOSAL_REVIEW_RECOMMENDED', reasons: ['REVIEW_RECOMMENDED'], requiresAdminReview: true };
  }
  return { outcome: 'PROPOSAL', reasons: [], requiresAdminReview: false };
}

/** A range wider than 4× its minimum is too uncertain to present as a preliminary estimate. */
export const priceSpreadPoor = (min: number, max: number): boolean => min > 0 && max / min > 4;

// ---- Historical reference ------------------------------------------------------------------------------

export interface HistoricalReference {
  sampleSize: number;
  median: number;
  p25: number;
  p75: number;
}

/** Robust summary of approved historical totals: IQR outlier removal, minimum 5 samples. */
export function historicalReference(totals: number[]): HistoricalReference | null {
  const sorted = totals.filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
  if (sorted.length < 5) return null;
  const q = (arr: number[], p: number) => {
    const i = (arr.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return arr[lo]! + (arr[hi]! - arr[lo]!) * (i - lo);
  };
  const q1 = q(sorted, 0.25);
  const q3 = q(sorted, 0.75);
  const iqr = q3 - q1;
  const kept = sorted.filter((t) => t >= q1 - 1.5 * iqr && t <= q3 + 1.5 * iqr);
  if (kept.length < 5) return null;
  return { sampleSize: kept.length, median: Math.round(q(kept, 0.5)), p25: Math.round(q(kept, 0.25)), p75: Math.round(q(kept, 0.75)) };
}

/** True when the estimate midpoint is further from the historical median than the tolerance allows. */
export function deviatesFromHistory(ref: HistoricalReference | null, min: number, max: number, tolerancePct: number): boolean {
  if (!ref) return false;
  const mid = (min + max) / 2;
  return Math.abs(mid - ref.median) / ref.median > tolerancePct / 100;
}
