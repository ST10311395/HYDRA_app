/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { config } from '../config/env';

const handler = (req: Request, res: Response): void => {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.', requestId: req.requestId },
  });
};

function limiter(opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler,
    skip: () => config().DISABLE_RATE_LIMIT,
    ...opts,
  });
}

/** Global API ceiling per client IP. */
export const apiLimiter = limiter({ windowMs: 60_000, limit: 300 });
/** Tight limits for credential endpoints (brute force / credential stuffing, PDF §6.1.4). */
export const loginLimiter = limiter({ windowMs: 15 * 60_000, limit: 10 });
export const passwordResetLimiter = limiter({ windowMs: 60 * 60_000, limit: 5 });
export const registerLimiter = limiter({ windowMs: 60 * 60_000, limit: 10 });
/** Public contact form — the most exposed surface (PDF §2.1.1 Visitor). */
export const contactLimiter = limiter({ windowMs: 60 * 60_000, limit: 8 });
export const uploadLimiter = limiter({ windowMs: 60_000, limit: 20 });
/** Smart Quote messages call an external AI provider: cap per client to protect cost and the provider quota. */
export const aiLimiter = limiter({ windowMs: 60_000, limit: 12 });
