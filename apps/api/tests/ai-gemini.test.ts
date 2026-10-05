/**
 * Google Gemini Smart Quote provider (AI_PROVIDER=gemini). The real `@google/genai` SDK runs against a
 * scripted `fetch`, so request shape, response handling and error mapping are tested without network
 * access or credentials.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { config, loadConfig, setConfig } from '../src/config/env';
import { parseProviderOutput } from '../src/ai/parse';
import { DEFAULT_PRICING_POLICY } from '../src/ai/policies';
import { aiProvider, createAiProvider, NoAiProvider } from '../src/ai/providers';
import { AnthropicProvider, ANALYSIS_JSON_SCHEMA } from '../src/ai/providers/anthropic';
import { GeminiProvider, geminiAcceptsImage, mapGeminiError } from '../src/ai/providers/gemini';
import { MockAiProvider } from '../src/ai/providers/mock';
import { OpenAiCompatibleProvider } from '../src/ai/providers/openai';
import { AiProviderError, type AiCaseInput } from '../src/ai/providers/types';

const FAKE_KEY = 'test-gemini-key-not-a-secret';
const MODEL = 'gemini-test-model';

const VALID = {
  summary: 'DB board trips when the geyser is switched on',
  serviceCategory: 'GEYSER_ELECTRICAL',
  severity: 2,
  severityReason: 'Nuisance tripping without signs of heat damage.',
  observations: ['Trips on geyser element'],
  clarifyingQuestions: [],
  needsMoreInformation: false,
  estimatedLabourHours: { min: 1, max: 2 },
  suggestedPricingFactors: [],
  confidence: 86,
  requiresAdminReview: false,
  adminReviewReason: null,
  safetyFlags: [],
  imageFindings: { status: 'ANALYSED', notes: ['Breaker labelled GEYSER visible'] },
  conflictingInformation: false,
};

/** The parts of a Gemini `generateContent` request body these tests inspect. */
interface GeminiRequestBody {
  contents: { role: string; parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[];
  systemInstruction: { parts: { text: string }[] };
  generationConfig: Record<string, unknown>;
  safetySettings?: unknown;
}

interface Captured {
  url: string;
  headers: Headers;
  body: GeminiRequestBody;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answer = (text: string, finishReason = 'STOP', extraParts: object[] = []) =>
  json(200, { candidates: [{ content: { role: 'model', parts: [...extraParts, { text }] }, finishReason }], modelVersion: MODEL });
const apiError = (status: number, message: string, reason?: string) =>
  json(status, { error: { code: status, message, status: 'ERROR', ...(reason ? { details: [{ reason }] } : {}) } });

/** A `fetch` that records each request and replies with the scripted responses in order. */
function scripted(...replies: (Response | Error | ((signal?: AbortSignal | null) => Promise<Response>))[]) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) as GeminiRequestBody });
    const next = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(init?.signal);
    return next.clone();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const provider = (fetchImpl: typeof fetch) => new GeminiProvider(FAKE_KEY, MODEL, undefined, fetchImpl);

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4//8/AwAI/AL+p9aksQAAAABJRU5ErkJggg==';
const input = (over: Partial<AiCaseInput> = {}): AiCaseInput => ({
  promptVersion: 't',
  systemPrompt: 'SYSTEM: approved knowledge only; never give DIY electrical instructions.',
  userPrompt: 'Customer: My DB trips whenever I turn my geyser on.',
  transcript: [{ role: 'CUSTOMER', text: 'My DB trips whenever I turn my geyser on.' }],
  images: [],
  context: { propertyType: null, customerUrgency: null, clarificationRoundsUsed: 0, clarificationRoundsRemaining: 3, imageCount: 0 },
  categories: DEFAULT_PRICING_POLICY.categories,
  knowledge: [],
  ...over,
});
const signal = () => new AbortController().signal;

async function failure(p: Promise<unknown>): Promise<AiProviderError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AiProviderError);
    return err as AiProviderError;
  }
  throw new Error('expected the provider call to fail');
}

describe('Gemini configuration', () => {
  const prod = {
    NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40), FILE_URL_SIGNING_SECRET: 'c'.repeat(40),
    PAYMENT_PROVIDER: 'paystack', PAYMENT_SECRET_KEY: 'sk', EMAIL_PROVIDER: 'smtp', PUBLIC_API_BASE_URL: 'https://api.example.co.za', DATABASE_SSL: 'true',
  };
  it('accepts AI_PROVIDER=gemini', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', AI_PROVIDER: 'gemini', AI_API_KEY: FAKE_KEY, AI_MODEL: MODEL, AI_TIMEOUT_MS: '25000', AI_MAX_RETRIES: '1' });
    expect(cfg.aiProvider).toBe('gemini');
    expect(cfg.AI_TIMEOUT_MS).toBe(25_000);
    expect(cfg.AI_MAX_RETRIES).toBe(1);
  });
  it('refuses Gemini in production without an API key, and allows it with one', () => {
    expect(() => loadConfig({ ...prod, AI_PROVIDER: 'gemini' })).toThrow(/AI_API_KEY/);
    expect(loadConfig({ ...prod, AI_PROVIDER: 'gemini', AI_API_KEY: FAKE_KEY, AI_MODEL: MODEL }).aiProvider).toBe('gemini');
  });
  it('rejects unknown provider names', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', AI_PROVIDER: 'google' })).toThrow(/AI_PROVIDER/);
  });
});

describe('provider selection', () => {
  const original = config();
  afterEach(() => setConfig(original));
  const use = (over: Record<string, string>) => setConfig(loadConfig({ NODE_ENV: 'test', ...over }));

  it('builds the Gemini adapter with the configured model', () => {
    use({ AI_PROVIDER: 'gemini', AI_API_KEY: FAKE_KEY, AI_MODEL: MODEL });
    const p = createAiProvider();
    expect(p).toBeInstanceOf(GeminiProvider);
    expect(p).toMatchObject({ name: 'gemini', model: MODEL, configured: true, simulation: false, supportsImages: true });
  });
  it('uses the owner model override', () => {
    use({ AI_PROVIDER: 'gemini', AI_API_KEY: FAKE_KEY, AI_MODEL: MODEL });
    expect(aiProvider('gemini-other').model).toBe('gemini-other');
  });
  it('falls back to human review when no model is configured', () => {
    use({ AI_PROVIDER: 'gemini', AI_API_KEY: FAKE_KEY });
    expect(createAiProvider()).toBeInstanceOf(NoAiProvider);
  });
  it('without a key: reports "not configured" and refuses to run (→ human review)', async () => {
    use({ AI_PROVIDER: 'gemini', AI_MODEL: MODEL });
    const p = createAiProvider();
    expect(p.configured).toBe(false);
    const err = await failure(p.analyseCase(input(), signal()));
    expect(err).toMatchObject({ kind: 'UNAVAILABLE', retryable: false });
  });
  it('keeps every original provider selectable', () => {
    use({ AI_PROVIDER: 'mock' });
    expect(createAiProvider()).toBeInstanceOf(MockAiProvider);
    use({ AI_PROVIDER: 'anthropic', AI_API_KEY: FAKE_KEY });
    expect(createAiProvider()).toBeInstanceOf(AnthropicProvider);
    use({ AI_PROVIDER: 'openai', AI_API_KEY: FAKE_KEY, AI_MODEL: 'gpt-test' });
    expect(createAiProvider()).toBeInstanceOf(OpenAiCompatibleProvider);
    use({ AI_PROVIDER: 'openai', AI_API_KEY: FAKE_KEY });
    expect(createAiProvider()).toBeInstanceOf(NoAiProvider);
    use({ AI_PROVIDER: 'none' });
    expect(createAiProvider()).toBeInstanceOf(NoAiProvider);
  });
});

describe('Gemini request', () => {
  it('sends one structured-output request with the system prompt, schema and model', async () => {
    const { calls, fetchImpl } = scripted(answer(JSON.stringify(VALID)));
    await provider(fetchImpl).analyseCase(input(), signal());
    expect(calls).toHaveLength(1);
    const { url, headers, body } = calls[0]!;
    expect(url).toContain(`models/${MODEL}:generateContent`);
    expect(body.systemInstruction.parts[0]!.text).toMatch(/never give DIY electrical instructions/);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: ANALYSIS_JSON_SCHEMA });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Customer: My DB trips whenever I turn my geyser on.' }] }]);
    // Default Gemini safety settings are never loosened.
    expect(body.safetySettings).toBeUndefined();
    // The key travels in a header only — never in the URL or body.
    expect(headers.get('x-goog-api-key')).toBe(FAKE_KEY);
    expect(url).not.toContain(FAKE_KEY);
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });
  it('attaches supported customer images inline and skips unsupported types', async () => {
    const { calls, fetchImpl } = scripted(answer(JSON.stringify(VALID)));
    const images = [
      { mimeType: 'image/png', base64: PNG_B64 },
      { mimeType: 'image/jpeg', base64: 'AAAA' },
      { mimeType: 'image/gif', base64: 'R0lG' },
    ];
    await provider(fetchImpl).analyseCase(input({ images, context: { ...input().context, imageCount: 3 } }), signal());
    const parts = calls[0]!.body.contents[0]!.parts;
    expect(parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: PNG_B64 } },
      { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
      { text: 'Customer: My DB trips whenever I turn my geyser on.' },
    ]);
    expect(geminiAcceptsImage('image/webp')).toBe(true);
    expect(geminiAcceptsImage('image/gif')).toBe(false);
    expect(geminiAcceptsImage('application/pdf')).toBe(false);
  });
  it('uses AI_BASE_URL as the endpoint when set', async () => {
    const { calls, fetchImpl } = scripted(answer(JSON.stringify(VALID)));
    await new GeminiProvider(FAKE_KEY, MODEL, 'https://gateway.example.test', fetchImpl).analyseCase(input(), signal());
    expect(calls[0]!.url.startsWith('https://gateway.example.test/')).toBe(true);
  });
});

describe('Gemini structured response parsing', () => {
  it('returns text that validates against the HYDRA analysis schema', async () => {
    const { fetchImpl } = scripted(answer(JSON.stringify(VALID)));
    const parsed = parseProviderOutput(await provider(fetchImpl).analyseCase(input(), signal()));
    expect(parsed).toMatchObject({ ok: true, repaired: false });
    if (parsed.ok) expect(parsed.data).toMatchObject({ severity: 2, confidence: 86, serviceCategory: 'GEYSER_ELECTRICAL' });
  });
  it('ignores thought summaries and joins the answer parts', async () => {
    const text = JSON.stringify(VALID);
    const { fetchImpl } = scripted(
      json(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: text.slice(0, 40) }, { text: text.slice(40) }] }, finishReason: 'STOP' }] }),
    );
    expect(await provider(fetchImpl).analyseCase(input(), signal())).toBe(text);
  });
  it('malformed JSON, wrong types and empty answers are rejected by HYDRA validation', async () => {
    for (const bad of ['{"summary": "cut off', '{"summary":"x","severity":"very high","confidence":90}', 'Sure! Here is my answer.', '']) {
      const { fetchImpl } = scripted(answer(bad));
      expect(parseProviderOutput(await provider(fetchImpl).analyseCase(input(), signal())).ok).toBe(false);
    }
  });
  it('out-of-range severity / confidence never pass validation', async () => {
    for (const over of [{ severity: 7 }, { severity: 0 }, { confidence: 140 }]) {
      const { fetchImpl } = scripted(answer(JSON.stringify({ ...VALID, ...over })));
      expect(parseProviderOutput(await provider(fetchImpl).analyseCase(input(), signal())).ok).toBe(false);
    }
  });
  it('a response with no candidates is an error, not an empty assessment', async () => {
    const { fetchImpl } = scripted(json(200, { candidates: [] }));
    expect(await failure(provider(fetchImpl).analyseCase(input(), signal()))).toMatchObject({ kind: 'ERROR', retryable: false });
  });
  it('a non-JSON HTTP body is an error', async () => {
    const { fetchImpl } = scripted(new Response('<html>gateway</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    expect(await failure(provider(fetchImpl).analyseCase(input(), signal()))).toMatchObject({ kind: 'ERROR', retryable: false });
  });
  it('blocked prompts and safety-stopped answers escalate (never retried)', async () => {
    const blocked = scripted(json(200, { promptFeedback: { blockReason: 'SAFETY' } }));
    expect(await failure(provider(blocked.fetchImpl).analyseCase(input(), signal()))).toMatchObject({ kind: 'ERROR', retryable: false, message: 'The AI provider declined this request' });
    for (const reason of ['SAFETY', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'RECITATION', 'SPII']) {
      const { fetchImpl } = scripted(answer('{}', reason));
      expect(await failure(provider(fetchImpl).analyseCase(input(), signal()))).toMatchObject({ kind: 'ERROR', retryable: false });
    }
  });
  it('a truncated answer is a retryable error', async () => {
    const { fetchImpl } = scripted(answer('{"summary": "par', 'MAX_TOKENS'));
    expect(await failure(provider(fetchImpl).analyseCase(input(), signal()))).toMatchObject({ kind: 'ERROR', retryable: true, message: 'The AI response was truncated' });
  });
});

describe('Gemini errors and timeouts', () => {
  const cases: [string, Response, Partial<AiProviderError>][] = [
    ['429 rate limit', apiError(429, 'Resource has been exhausted'), { kind: 'RATE_LIMITED', retryable: true }],
    ['401', apiError(401, 'Unauthenticated'), { kind: 'UNAVAILABLE', retryable: false }],
    ['403', apiError(403, 'Permission denied'), { kind: 'UNAVAILABLE', retryable: false }],
    ['400 invalid key', apiError(400, 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'), { kind: 'UNAVAILABLE', retryable: false }],
    ['400 bad request', apiError(400, 'Invalid JSON payload'), { kind: 'ERROR', retryable: false }],
    ['404 unknown model', apiError(404, 'models/x is not found'), { kind: 'ERROR', retryable: false }],
    ['500', apiError(500, 'Internal error'), { kind: 'ERROR', retryable: true }],
    ['503 overloaded', apiError(503, 'The model is overloaded'), { kind: 'ERROR', retryable: true }],
    ['504 deadline', apiError(504, 'Deadline exceeded'), { kind: 'TIMEOUT', retryable: true }],
  ];
  it.each(cases)('maps %s', async (_label, res, expected) => {
    const { calls, fetchImpl } = scripted(res);
    const err = await failure(provider(fetchImpl).analyseCase(input(), signal()));
    expect(err).toMatchObject(expected);
    // HYDRA owns retries: the SDK makes exactly one request per attempt.
    expect(calls).toHaveLength(1);
    expect(err.message).not.toContain(FAKE_KEY);
  });
  it('maps network failures to a retryable connection error', async () => {
    const { fetchImpl } = scripted(new TypeError('fetch failed'));
    expect(await failure(provider(fetchImpl).analyseCase(input(), signal()))).toMatchObject({ kind: 'ERROR', retryable: true, message: 'AI provider connection failed' });
  });
  it('honours the orchestrator abort signal as a timeout', async () => {
    const hang = (s?: AbortSignal | null) =>
      new Promise<Response>((_resolve, reject) => {
        s?.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
      });
    const { fetchImpl } = scripted(hang);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const started = Date.now();
    expect(await failure(provider(fetchImpl).analyseCase(input(), controller.signal))).toMatchObject({ kind: 'TIMEOUT', retryable: true });
    expect(Date.now() - started).toBeLessThan(5_000);
  });
  it('never echoes SDK error text (which may contain request details)', () => {
    const err = mapGeminiError(new Error(`boom ${FAKE_KEY}`));
    expect(err).toMatchObject({ kind: 'ERROR', retryable: false, message: 'AI provider call failed' });
  });
});
