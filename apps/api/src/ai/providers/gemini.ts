import { ApiError, GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import { ANALYSIS_JSON_SCHEMA } from './anthropic';
import { AiProviderError, type AiCaseInput, type AiProvider } from './types';

/** Inline image types the Gemini API accepts (HEIC is never sent — the orchestrator skips it). */
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heif'];
export const geminiAcceptsImage = (mime: string): boolean => SUPPORTED_IMAGE_TYPES.includes(mime);

/** Finish reasons where Gemini withheld or cut the answer for policy reasons — escalate, never retry. */
const DECLINED_FINISH_REASONS = ['SAFETY', 'RECITATION', 'LANGUAGE', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION'];

/**
 * Google Gemini adapter (official `@google/genai` SDK, Gemini Developer API). Configured by
 * AI_PROVIDER=gemini, AI_API_KEY, AI_MODEL (required). SDK retries are left off because HYDRA's
 * orchestrator owns retry/timeout policy and logs each attempt. Gemini's default safety settings are
 * kept — HYDRA never loosens them. A blocked or truncated answer escalates to a human.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly simulation = false;
  readonly supportsImages = true;
  readonly configured: boolean;
  private readonly client: GoogleGenAI | null;

  /** `fetchImpl` lets tests exercise the real SDK request/response path without the network. */
  constructor(apiKey: string | undefined, readonly model: string, baseUrl?: string, fetchImpl?: typeof fetch) {
    this.configured = !!apiKey;
    this.client = apiKey
      ? new GoogleGenAI({ apiKey, vertexai: false, httpOptions: { ...(baseUrl ? { baseUrl } : {}), ...(fetchImpl ? { fetch: fetchImpl } : {}), retryOptions: { attempts: 1 } } })
      : null;
  }

  async analyseCase(input: AiCaseInput, signal: AbortSignal): Promise<string> {
    if (!this.client) throw new AiProviderError('UNAVAILABLE', 'Gemini provider is not configured', false);
    const images = input.images.filter((i) => geminiAcceptsImage(i.mimeType));
    let res: GenerateContentResponse;
    try {
      res = await this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })), { text: input.userPrompt }],
          },
        ],
        config: {
          systemInstruction: input.systemPrompt,
          responseMimeType: 'application/json',
          responseJsonSchema: ANALYSIS_JSON_SCHEMA,
          maxOutputTokens: 8192,
          abortSignal: signal,
        },
      });
    } catch (err) {
      throw mapGeminiError(err, signal);
    }
    return extractText(res);
  }
}

/** Turns a Gemini response into raw text for HYDRA's parser, or a classified provider error. */
function extractText(res: GenerateContentResponse): string {
  if (res.promptFeedback?.blockReason) throw new AiProviderError('ERROR', 'The AI provider declined this request', false);
  const candidate = res.candidates?.[0];
  if (!candidate) throw new AiProviderError('ERROR', 'The AI provider returned no answer', false);
  const reason = candidate.finishReason as string | undefined;
  if (reason && DECLINED_FINISH_REASONS.includes(reason)) throw new AiProviderError('ERROR', 'The AI provider declined this request', false);
  if (reason === 'MAX_TOKENS') throw new AiProviderError('ERROR', 'The AI response was truncated', true);
  // Thought summaries are never part of the answer; HYDRA validates whatever text remains.
  return (candidate.content?.parts ?? []).map((p) => (typeof p.text === 'string' && !p.thought ? p.text : '')).join('');
}

/** Fixed, secret-free messages only: SDK error text can echo request details. */
export function mapGeminiError(err: unknown, signal?: AbortSignal): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const name = (err as Error | undefined)?.name;
  if (signal?.aborted || name === 'AbortError' || name === 'TimeoutError') return new AiProviderError('TIMEOUT', 'AI provider timed out');
  if (err instanceof ApiError) {
    const status = err.status;
    if (status === 429) return new AiProviderError('RATE_LIMITED', 'AI provider rate limit reached');
    if (status === 401 || status === 403) return new AiProviderError('UNAVAILABLE', 'AI provider rejected the credentials', false);
    // Gemini reports an invalid key as 400 INVALID_ARGUMENT with reason API_KEY_INVALID.
    if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(err.message)) return new AiProviderError('UNAVAILABLE', 'AI provider rejected the credentials', false);
    if (status === 408 || status === 504) return new AiProviderError('TIMEOUT', 'AI provider timed out');
    if (status >= 500) return new AiProviderError('ERROR', `AI provider error ${status}`, true);
    return new AiProviderError('ERROR', `AI provider request failed (${status})`, false);
  }
  if (err instanceof TypeError) return new AiProviderError('ERROR', 'AI provider connection failed', true);
  return new AiProviderError('ERROR', 'AI provider call failed', false);
}
