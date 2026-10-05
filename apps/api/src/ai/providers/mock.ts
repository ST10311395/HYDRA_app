import { AI_IMAGE_UNAVAILABLE_NOTICE } from '@hydra/shared';
import { classifyCategory } from '../engine';
import { findPhrases } from '../text';
import { AiProviderError, type AiCaseInput, type AiProvider } from './types';

/**
 * Deterministic DEVELOPMENT simulation (AI_PROVIDER=mock; refused in production). It derives a
 * plausible structured result from keywords and approved knowledge so the full workflow can be tested
 * without credentials. It never claims to have looked at images: image findings are always
 * "UNAVAILABLE" with the standard notice, and every UI labels its output "Development AI simulation".
 *
 * Test directives in the customer text: [mock:timeout] [mock:error] [mock:ratelimit] [mock:malformed]
 * [mock:confident] (skip questions) [mock:unclear-image] [mock:conflict] [mock:review].
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'hydra-dev-simulation-1';
  readonly configured = true;
  readonly simulation = true;
  readonly supportsImages = false;

  async analyseCase(input: AiCaseInput, signal: AbortSignal): Promise<string> {
    const customer = input.transcript.filter((t) => t.role === 'CUSTOMER').map((t) => t.text);
    const all = customer.join('\n');
    const lower = all.toLowerCase();
    if (lower.includes('[mock:timeout]')) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 120_000);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new AiProviderError('TIMEOUT', 'AI provider timed out'));
        });
      });
    }
    if (lower.includes('[mock:error]')) throw new AiProviderError('ERROR', 'Simulated provider error', false);
    if (lower.includes('[mock:ratelimit]')) throw new AiProviderError('RATE_LIMITED', 'Simulated rate limit');
    if (lower.includes('[mock:malformed]')) return '{"summary": "Simulated malformed output", "severity": "very high", "confidence": ';

    const top = input.knowledge[0];
    const knowledgeCategory = top && top.score >= 0.35 ? input.categories.find((c) => c.code === top.serviceCategory) : undefined;
    const classified = classifyCategory(all, input.categories);
    const category = knowledgeCategory ?? classified.category;
    const recognised = !!knowledgeCategory || (classified.score > 0 && category.supported);

    const answeredBefore = customer.length > 1;
    // Approved knowledge supplies its own (admin-written) follow-up questions; none means "quote directly".
    const approvedQuestions = knowledgeCategory ? top!.clarifyingQuestions.slice(0, 3) : null;
    const questions = approvedQuestions ?? questionsFor(category.code);
    const wantsQuestions =
      recognised && questions.length > 0 && !answeredBefore && input.context.clarificationRoundsRemaining > 0 && !lower.includes('[mock:confident]');

    let severity = knowledgeCategory ? top!.severity : category.defaultSeverity;
    if (findPhrases(all, ['whole house', 'entire house', 'no power at all', 'business', 'shop', 'factory', 'everything is off']).some((h) => !h.negated)) {
      severity = Math.max(severity, 3);
    }

    let confidence = recognised ? 84 : 35;
    if (knowledgeCategory) confidence = 88;
    if (answeredBefore && recognised) confidence += 4;
    if (findPhrases(all, ['not sure', 'no idea', 'strange', 'weird', 'random']).length) confidence -= 15;

    const images = input.context.imageCount > 0;
    const imageStatus = lower.includes('[mock:unclear-image]') ? 'UNCLEAR' : images ? 'UNAVAILABLE' : 'NOT_PROVIDED';
    const firstSentence = (customer[0] ?? '').replace(/\[mock:[a-z-]+\]/gi, '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';

    return JSON.stringify({
      summary: `${category.label}: ${firstSentence.slice(0, 200) || 'customer-reported issue'}`,
      serviceCategory: category.code,
      severity: Math.min(5, severity),
      severityReason: knowledgeCategory
        ? `Matches approved PSG knowledge "${top!.title}".`
        : recognised
          ? `Typical severity for ${category.label.toLowerCase()} based on the description.`
          : 'The description does not match a known service pattern.',
      observations: [
        ...(classified.matched.length ? [`Mentions: ${classified.matched.slice(0, 5).join(', ')}`] : []),
        ...(answeredBefore ? ['Customer answered follow-up questions'] : []),
      ],
      clarifyingQuestions: wantsQuestions ? questions : [],
      needsMoreInformation: wantsQuestions,
      estimatedLabourHours: { min: category.labourHours.min, max: Math.round(((category.labourHours.min + category.labourHours.max) / 2) * 2) / 2 },
      suggestedPricingFactors: knowledgeCategory && top!.pricingContext ? [top!.pricingContext.slice(0, 200)] : [],
      confidence: Math.max(0, Math.min(100, confidence)),
      requiresAdminReview: lower.includes('[mock:review]'),
      adminReviewReason: lower.includes('[mock:review]') ? 'Simulated request for human review' : null,
      safetyFlags: [],
      imageFindings: { status: imageStatus, notes: images ? [AI_IMAGE_UNAVAILABLE_NOTICE] : [] },
      conflictingInformation: lower.includes('[mock:conflict]'),
    });
  }
}

function questionsFor(code: string): string[] {
  if (['FAULT_FINDING', 'GEYSER_ELECTRICAL', 'DB_BOARD'].includes(code)) {
    return [
      'Does the main breaker trip, or only the circuit for the affected appliance?',
      'Is there any burning smell, heat or visible damage?',
      'Has any electrical work recently been performed?',
    ];
  }
  if (['INVERTER', 'BATTERY', 'SOLAR_PANELS', 'BACKUP_POWER', 'SOLAR_MAINTENANCE', 'SOLAR_UPGRADE'].includes(code)) {
    return [
      'What size and brand is the system, and roughly how old is it?',
      'Is there an error code or message on the inverter screen? A photo of the screen helps.',
      'Is the system completely off, or only partly working?',
    ];
  }
  return [
    'Is the problem constant or does it come and go?',
    'Roughly how many points, lights or circuits are affected?',
    'Is this at a home or a business site?',
  ];
}
