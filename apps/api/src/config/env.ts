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
