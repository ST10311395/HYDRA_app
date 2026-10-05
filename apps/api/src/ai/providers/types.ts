/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { PricingCategory } from '@hydra/shared';

/** One redacted line of the conversation as the provider sees it. */
export interface TranscriptLine {
  role: 'CUSTOMER' | 'ASSISTANT' | 'TEAM';
  text: string;
}

export interface RetrievedKnowledgeForPrompt {
  id: string;
  version: number;
  title: string;
  serviceCategory: string;
  problemSummary: string;
  symptoms: string[];
  severity: number;
  pricingContext: string | null;
  recommendedResponse: string;
  clarifyingQuestions: string[];
  score: number;
}

/** Everything a provider may use. Personal details are already redacted; no site address, no names. */
export interface AiCaseInput {
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  transcript: TranscriptLine[];
  images: { mimeType: string; base64: string }[];
  context: {
    propertyType: string | null;
    customerUrgency: string | null;
    clarificationRoundsUsed: number;
    clarificationRoundsRemaining: number;
    imageCount: number;
  };
  categories: PricingCategory[];
  knowledge: RetrievedKnowledgeForPrompt[];
}

export type AiProviderErrorKind = 'TIMEOUT' | 'RATE_LIMITED' | 'ERROR' | 'UNAVAILABLE';

export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiProviderErrorKind,
    message: string,
    public readonly retryable = kind === 'TIMEOUT' || kind === 'RATE_LIMITED',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * Provider abstraction. Adapters only translate `AiCaseInput` into one structured request and return
 * the raw text; validation, repair, retries, timeouts, safety and pricing all live in HYDRA code so
 * swapping providers never changes business behaviour.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Credentials present (or no credentials needed). */
  readonly configured: boolean;
  /** Deterministic development simulation — must be labelled as such in every UI. */
  readonly simulation: boolean;
  readonly supportsImages: boolean;
  analyseCase(input: AiCaseInput, signal: AbortSignal): Promise<string>;
}
