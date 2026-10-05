/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import { ANALYSIS_JSON_SCHEMA } from './anthropic';
import { AiProviderError, type AiCaseInput, type AiProvider } from './types';

/**
 * OpenAI-compatible Chat Completions adapter (AI_PROVIDER=openai). AI_BASE_URL can point at an Azure
 * OpenAI deployment or any compatible gateway. Plain `fetch` keeps this optional adapter dependency-free;
 * HYDRA validates the response exactly as for every other provider.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai';
  readonly simulation = false;
  readonly supportsImages = true;
  readonly configured: boolean;

  constructor(private readonly apiKey: string | undefined, readonly model: string, private readonly baseUrl = 'https://api.openai.com/v1') {
    this.configured = !!apiKey;
  }

  async analyseCase(input: AiCaseInput, signal: AbortSignal): Promise<string> {
    if (!this.apiKey) throw new AiProviderError('UNAVAILABLE', 'OpenAI-compatible provider is not configured', false);
    const content = [
      { type: 'text', text: input.userPrompt },
      ...input.images
        .filter((i) => ['image/jpeg', 'image/png', 'image/webp'].includes(i.mimeType))
        .map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.base64}` } })),
    ];
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}`, 'api-key': this.apiKey },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: input.systemPrompt }, { role: 'user', content }],
          response_format: { type: 'json_schema', json_schema: { name: 'smart_quote_assessment', strict: true, schema: ANALYSIS_JSON_SCHEMA } },
        }),
        signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError' || (err as Error).name === 'TimeoutError') throw new AiProviderError('TIMEOUT', 'AI provider timed out');
      throw new AiProviderError('ERROR', 'AI provider connection failed', true);
    }
    if (res.status === 429) throw new AiProviderError('RATE_LIMITED', 'AI provider rate limit reached');
    if (res.status === 401 || res.status === 403) throw new AiProviderError('UNAVAILABLE', 'AI provider rejected the credentials', false);
    if (res.status >= 500) throw new AiProviderError('ERROR', `AI provider error ${res.status}`, true);
    if (!res.ok) throw new AiProviderError('ERROR', `AI provider request failed (${res.status})`, false);
    const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string; refusal?: string | null } }[] } | null;
    const msg = body?.choices?.[0]?.message;
    if (msg?.refusal) throw new AiProviderError('ERROR', 'The AI provider declined this request', false);
    return msg?.content ?? '';
  }
}
