/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/** Typed application errors mapped to a single structured error response format. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: { path: string; message: string }[]) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const validationError = (details: { path: string; message: string }[]) =>
  new AppError(422, 'VALIDATION_FAILED', 'Some fields need attention', details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
/** Used for ownership failures too, so resource existence is not leaked across accounts. */
export const notFound = (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const businessRule = (message: string, code = 'BUSINESS_RULE_VIOLATION') => new AppError(422, code, message);
export const tooMany = (message = 'Too many requests. Please try again later.') =>
  new AppError(429, 'RATE_LIMITED', message);
export const serviceUnavailable = (message: string, code = 'SERVICE_UNAVAILABLE') => new AppError(503, code, message);
