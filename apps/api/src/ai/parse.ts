import { aiAnalysisSchema, type AiAnalysis } from '@hydra/shared';

export type ParseResult =
  | { ok: true; data: AiAnalysis; repaired: boolean }
  | { ok: false; error: string };

/** Pulls the first balanced JSON object out of text (code fences, prose before/after). */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Light, safe normalisation of common model deviations (snake_case keys, scalar-for-array). */
function repairShape(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[camel] = v;
  }
  for (const key of ['observations', 'clarifyingQuestions', 'suggestedPricingFactors', 'safetyFlags']) {
    if (typeof out[key] === 'string') out[key] = [out[key]];
    if (out[key] === null) delete out[key];
  }
  return out;
}

/** A fractional confidence (0.82) is on a 0–1 scale; HYDRA stores 0–100. */
function normaliseConfidence(obj: Record<string, unknown>): boolean {
  if (typeof obj.confidence === 'number' && obj.confidence > 0 && obj.confidence < 1) {
    obj.confidence = Math.round(obj.confidence * 100);
    return true;
  }
  return false;
}

/**
 * Never trusts raw provider output: parse → (repair) → Zod validation. Anything that still fails is
 * rejected and the case is escalated to a human (MALFORMED_AI_RESPONSE).
 */
export function parseProviderOutput(raw: string): ParseResult {
  let value: unknown;
  let repaired = false;
  try {
    value = JSON.parse(raw);
  } catch {
    const extracted = extractJsonObject(raw);
    if (!extracted) return { ok: false, error: 'No JSON object in response' };
    try {
      value = JSON.parse(extracted);
      repaired = true;
    } catch {
      return { ok: false, error: 'Response JSON could not be parsed' };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Response is not a JSON object' };
  // Normalise before validating: unknown (e.g. snake_case) keys would otherwise be silently dropped.
  const original = value as Record<string, unknown>;
  const reshaped = repairShape(original);
  if (normaliseConfidence(reshaped) || JSON.stringify(reshaped) !== JSON.stringify(original)) repaired = true;
  const result = aiAnalysisSchema.safeParse(reshaped);
  if (result.success) return { ok: true, data: result.data, repaired };
  return { ok: false, error: result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 280) };
}
