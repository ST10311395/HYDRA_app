import pino from 'pino';
import { config } from './env';

/**
 * Structured logger. Sensitive fields are redacted so tokens, passwords, card data and
 * provider secrets never reach log sinks (spec §17.5, PDF §6.7).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-paystack-signature"]',
  'req.headers["x-hydra-signature"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.idToken',
  '*.token',
  '*.qrToken',
  '*.secret',
  '*.cardNumber',
  '*.cvv',
];

export const logger = pino({
  level: config().isTest ? 'silent' : config().LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'hydra-api', env: config().APP_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
});
