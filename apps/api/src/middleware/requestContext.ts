/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Correlation ID for logs and audit entries (spec §17.5). Accepts a safe inbound X-Request-Id. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  req.requestId = inbound && /^[A-Za-z0-9-]{8,64}$/.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
