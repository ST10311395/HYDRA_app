/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import type { Request } from 'express';
import type { z } from 'zod';
import { validationError } from '../utils/errors';

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      result.error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message })),
    );
  }
  return result.data;
}

/** Validates the JSON body against a shared Zod DTO schema (server is authoritative, spec §16). */
export const validBody = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> => parse(schema, req.body ?? {});
export const validQuery = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> => parse(schema, req.query ?? {});
export const validParams = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> => parse(schema, req.params ?? {});
export { parse as validate };
