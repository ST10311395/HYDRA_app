/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * Microsoft. 2026. Azure App Service documentation. Available at: https://learn.microsoft.com/en-us/azure/app-service/ [Accessed 5 October 2026].
 * Microsoft. 2026. Azure Database for PostgreSQL documentation. Available at: https://learn.microsoft.com/en-us/azure/postgresql/ [Accessed 1 October 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * OWASP Foundation. 2021. OWASP Top Ten Web Application Security Risks. Available at: https://owasp.org/www-project-top-ten/ [Accessed 5 September 2026].
 * OWASP Foundation. 2023. OWASP API Security Top 10. Available at: https://owasp.org/API-Security/ [Accessed 2 September 2026].
 */
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().default('local'),
  // 0.0.0.0 so phones and emulators on the LAN can reach a local dev server; App Service sets its own.
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: csv,
  TRUST_PROXY: bool,

  DATABASE_URL: z.string().min(1).default('postgres://hydra:hydra_local_dev@localhost:5433/hydra'),
  DATABASE_SSL: bool,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  JWT_ACCESS_SECRET: optional,
  JWT_REFRESH_SECRET: optional,
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  JWT_ISSUER: z.string().default('hydra-api'),
  JWT_AUDIENCE: z.string().default('hydra-mobile'),
  QR_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  GOOGLE_WEB_CLIENT_ID: optional,
  GOOGLE_ANDROID_CLIENT_ID: optional,
  GOOGLE_IOS_CLIENT_ID: optional,

  STORAGE_PROVIDER: z.enum(['local', 'azure']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  FILE_URL_SIGNING_SECRET: optional,
  AZURE_STORAGE_CONNECTION_STRING: optional,
  AZURE_STORAGE_CONTAINER: z.string().default('hydra-private'),
  AZURE_KEY_VAULT_URL: optional,
  APPLICATIONINSIGHTS_CONNECTION_STRING: optional,

  PAYMENT_PROVIDER: z.enum(['paystack', 'simulated']).default('simulated'),
  PAYMENT_PUBLIC_KEY: optional,
  PAYMENT_SECRET_KEY: optional,
  PAYMENT_WEBHOOK_SECRET: optional,
  PAYMENT_CALLBACK_URL: z.string().default('hydra://payments/complete'),
  PAYMENT_CURRENCY: z.string().length(3).default('ZAR'),

  SMS_PROVIDER: z.enum(['twilio', 'none']).default('none'),
  SMS_API_KEY: optional,
  SMS_FROM_NUMBER: optional,
  WHATSAPP_PROVIDER: z.enum(['twilio', 'none']).default('none'),
  WHATSAPP_API_KEY: optional,
  WHATSAPP_FROM_NUMBER: optional,

  PUSH_NOTIFICATION_CONFIG: z.enum(['expo', 'none']).default('expo'),
  EXPO_ACCESS_TOKEN: optional,
  EMAIL_PROVIDER: z.enum(['smtp', 'console']).default('console'),
  EMAIL_API_KEY: optional,
  EMAIL_FROM: z.string().default('PSG Electrical <no-reply@example.co.za>'),
  PASSWORD_RESET_URL: z.string().default('hydra://reset-password'),

  // HYDRA Smart Quote (docs/AI_ASSISTANT.md). Keys come from the environment / Key Vault only.
  AI_ASSISTANT_ENABLED: z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => v === undefined || v === '' || v === 'true' || v === '1'),
  /** Unset → `mock` in development/test, `none` (human-only review) in production. */
  AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai', 'gemini', 'none']).optional(),
  AI_MODEL: optional,
  AI_API_KEY: optional,
  /** Custom endpoint (e.g. an Azure OpenAI deployment or a gateway); defaults to the provider's public API. */
  AI_BASE_URL: optional,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),

  SEED_DEMO_PASSWORD: optional,
  DISABLE_RATE_LIMIT: bool,
  DISABLE_SCHEDULER: bool,
});

export type Env = z.infer<typeof envSchema>;

/** Development-only fallback secrets. Refused in production (see assertProductionSafety). */
const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me-0123456789abcdef';
const DEV_REFRESH_SECRET = 'dev-only-refresh-secret-change-me-0123456789abcdef';
const DEV_FILE_SECRET = 'dev-only-file-signing-secret-0123456789abcdef';
const DEV_WEBHOOK_SECRET = 'dev-only-simulated-webhook-secret-0123456789';

export interface AppConfig extends Env {
  isProduction: boolean;
  isTest: boolean;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  fileSigningSecret: string;
  webhookSecret: string;
  googleClientIds: string[];
  aiProvider: 'mock' | 'anthropic' | 'openai' | 'gemini' | 'none';
}

export function assertProductionSafety(env: Env): void {
  if (env.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) problems.push('JWT_ACCESS_SECRET (>=32 chars)');
  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32) problems.push('JWT_REFRESH_SECRET (>=32 chars)');
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    problems.push('JWT secrets must differ');
  if (!env.FILE_URL_SIGNING_SECRET) problems.push('FILE_URL_SIGNING_SECRET');
  if (env.PAYMENT_PROVIDER === 'simulated') problems.push('PAYMENT_PROVIDER=simulated is not allowed in production');
  if (env.PAYMENT_PROVIDER === 'paystack' && !env.PAYMENT_SECRET_KEY) problems.push('PAYMENT_SECRET_KEY');
  if (env.EMAIL_PROVIDER === 'console') problems.push('EMAIL_PROVIDER=console is not allowed in production');
  if (env.STORAGE_PROVIDER === 'azure' && !env.AZURE_STORAGE_CONNECTION_STRING)
    problems.push('AZURE_STORAGE_CONNECTION_STRING');
  if (!env.PUBLIC_API_BASE_URL.startsWith('https://')) problems.push('PUBLIC_API_BASE_URL must use https');
  if (!env.DATABASE_SSL) problems.push('DATABASE_SSL must be true in production');
  if (env.AI_PROVIDER === 'mock') problems.push('AI_PROVIDER=mock (development simulation) is not allowed in production — use a real provider or none');
  if ((env.AI_PROVIDER === 'anthropic' || env.AI_PROVIDER === 'openai' || env.AI_PROVIDER === 'gemini') && !env.AI_API_KEY) problems.push('AI_API_KEY');
  if (problems.length > 0) {
    throw new Error(`Unsafe production configuration: ${problems.join('; ')}`);
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${msg}`);
  }
  const env = parsed.data;
  assertProductionSafety(env);
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    jwtAccessSecret: env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
    fileSigningSecret: env.FILE_URL_SIGNING_SECRET ?? DEV_FILE_SECRET,
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? DEV_WEBHOOK_SECRET,
    googleClientIds: [env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID].filter(
      (v): v is string => !!v,
    ),
    aiProvider: env.AI_PROVIDER ?? (env.NODE_ENV === 'production' ? 'none' : 'mock'),
  };
}

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Test helper: replace the process-wide config. */
export function setConfig(next: AppConfig): void {
  cached = next;
}
