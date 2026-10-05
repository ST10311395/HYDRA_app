import { config } from '../../config/env';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { MockAiProvider } from './mock';
import { OpenAiCompatibleProvider } from './openai';
import { AiProviderError, type AiProvider } from './types';

/** Human-only mode: every case goes to the admin queue (AI_PROVIDER=none or owner "HUMAN_ONLY"). */
export class NoAiProvider implements AiProvider {
  readonly name = 'none';
  readonly model = 'none';
  readonly configured = false;
  readonly simulation = false;
  readonly supportsImages = false;
  async analyseCase(): Promise<string> {
    throw new AiProviderError('UNAVAILABLE', 'No AI provider is configured — human review only', false);
  }
}

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/** Builds the configured provider. `modelOverride` comes from owner settings (never a secret). */
export function createAiProvider(modelOverride?: string): AiProvider {
  const cfg = config();
  const model = modelOverride?.trim() || cfg.AI_MODEL;
  switch (cfg.aiProvider) {
    case 'mock':
      return new MockAiProvider();
    case 'anthropic':
      return new AnthropicProvider(cfg.AI_API_KEY, model ?? DEFAULT_ANTHROPIC_MODEL, cfg.AI_BASE_URL);
    case 'openai':
      return model ? new OpenAiCompatibleProvider(cfg.AI_API_KEY, model, cfg.AI_BASE_URL) : new NoAiProvider();
    case 'gemini':
      // No default model: Gemini model names change often, so an unset AI_MODEL means human review.
      return model ? new GeminiProvider(cfg.AI_API_KEY, model, cfg.AI_BASE_URL) : new NoAiProvider();
    default:
      return new NoAiProvider();
  }
}

let override: AiProvider | null = null;

/** Tests replace the provider (e.g. a failing or scripted one) — mirrors `overrideIntegrations`. */
export function overrideAiProvider(p: AiProvider | null): void {
  override = p;
}

export function aiProvider(modelOverride?: string): AiProvider {
  return override ?? createAiProvider(modelOverride);
}

export { AiProviderError };
export type { AiProvider };
