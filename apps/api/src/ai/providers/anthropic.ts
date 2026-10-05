import Anthropic from '@anthropic-ai/sdk';
import { AiProviderError, type AiCaseInput, type AiProvider } from './types';

/** JSON schema for structured output — mirrors `aiAnalysisSchema` (which still validates the result). */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary', 'serviceCategory', 'severity', 'severityReason', 'observations', 'clarifyingQuestions', 'needsMoreInformation',
    'estimatedLabourHours', 'suggestedPricingFactors', 'confidence', 'requiresAdminReview', 'adminReviewReason', 'safetyFlags',
    'imageFindings', 'conflictingInformation',
  ],
  properties: {
    summary: { type: 'string' },
    serviceCategory: { type: 'string' },
    severity: { type: 'integer' },
    severityReason: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    clarifyingQuestions: { type: 'array', items: { type: 'string' } },
    needsMoreInformation: { type: 'boolean' },
    estimatedLabourHours: {
      anyOf: [
        { type: 'object', additionalProperties: false, required: ['min', 'max'], properties: { min: { type: 'number' }, max: { type: 'number' } } },
        { type: 'null' },
      ],
    },
    suggestedPricingFactors: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'integer' },
    requiresAdminReview: { type: 'boolean' },
    adminReviewReason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    safetyFlags: { type: 'array', items: { type: 'string' } },
    imageFindings: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'notes'],
      properties: { status: { type: 'string', enum: ['ANALYSED', 'UNCLEAR', 'NOT_PROVIDED', 'UNAVAILABLE'] }, notes: { type: 'array', items: { type: 'string' } } },
    },
    conflictingInformation: { type: 'boolean' },
  },
} as const;

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedImage = (typeof SUPPORTED_IMAGE_TYPES)[number];
export const anthropicAcceptsImage = (mime: string): mime is SupportedImage => (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);

/**
 * Anthropic Claude adapter (official SDK). Configured by AI_PROVIDER=anthropic, AI_API_KEY, AI_MODEL.
 * Retries are disabled here because HYDRA's orchestrator owns retry/timeout policy and logs each attempt.
 * Server-side refusal fallbacks are enabled (`fallbacks: "default"`); a final refusal escalates to a human.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly simulation = false;
  readonly supportsImages = true;
  readonly configured: boolean;
  private readonly client: Anthropic | null;

  constructor(apiKey: string | undefined, readonly model: string, baseURL?: string) {
    this.configured = !!apiKey;
    this.client = apiKey ? new Anthropic({ apiKey, baseURL, maxRetries: 0 }) : null;
  }

  async analyseCase(input: AiCaseInput, signal: AbortSignal): Promise<string> {
    if (!this.client) throw new AiProviderError('UNAVAILABLE', 'Anthropic provider is not configured', false);
    const images = input.images.filter((i) => anthropicAcceptsImage(i.mimeType));
    try {
      const res = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: input.systemPrompt,
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANALYSIS_JSON_SCHEMA as unknown as Record<string, unknown> } },
          messages: [
            {
              role: 'user',
              content: [
                ...images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: img.mimeType as SupportedImage, data: img.base64 } })),
                { type: 'text' as const, text: input.userPrompt },
              ],
            },
          ],
        },
        { signal },
      );
      if (res.stop_reason === 'refusal') throw new AiProviderError('ERROR', 'The AI provider declined this request', false);
      if (res.stop_reason === 'max_tokens') throw new AiProviderError('ERROR', 'The AI response was truncated', true);
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderError('TIMEOUT', 'AI provider timed out');
      if (err instanceof Anthropic.RateLimitError) throw new AiProviderError('RATE_LIMITED', 'AI provider rate limit reached');
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AiProviderError('UNAVAILABLE', 'AI provider rejected the credentials', false);
      if (err instanceof Anthropic.InternalServerError) throw new AiProviderError('ERROR', `AI provider error ${err.status}`, true);
      if (err instanceof Anthropic.APIConnectionError) throw new AiProviderError('ERROR', 'AI provider connection failed', true);
      if (err instanceof Anthropic.APIError) throw new AiProviderError('ERROR', `AI provider request failed (${String(err.status)})`, false);
      throw new AiProviderError('ERROR', 'AI provider call failed', false);
    }
  }
}
