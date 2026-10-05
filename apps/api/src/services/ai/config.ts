import {
  aiSettingsSchema,
  pricingPolicySchema,
  severityPolicySchema,
  type AiSettings,
  type PricingPolicy,
  type SeverityPolicy,
} from '@hydra/shared';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { withTransaction, type Queryable } from '../../db/pool';
import { DEFAULT_AI_SETTINGS, DEFAULT_PRICING_POLICY, DEFAULT_SEVERITY_POLICY } from '../../ai/policies';
import { aiProvider, NoAiProvider } from '../../ai/providers';
import type { AiProvider } from '../../ai/providers/types';
import { PostgresAiRepository, type PolicyKind } from '../../repositories/aiRepository';

export interface AiConfig {
  settings: AiSettings;
  settingsVersion: number;
  severity: SeverityPolicy;
  severityVersion: number;
  pricing: PricingPolicy;
  pricingVersion: number;
}

const SCHEMAS = { SETTINGS: aiSettingsSchema, SEVERITY: severityPolicySchema, PRICING: pricingPolicySchema } as const;
const DEFAULTS = { SETTINGS: DEFAULT_AI_SETTINGS, SEVERITY: DEFAULT_SEVERITY_POLICY, PRICING: DEFAULT_PRICING_POLICY } as const;

/** Writes version 1 of any missing policy (first run / fresh database). Idempotent. */
export async function ensureDefaultPolicies(): Promise<void> {
  await withTransaction(async (tx) => {
    const repo = new PostgresAiRepository(tx);
    for (const kind of ['SETTINGS', 'SEVERITY', 'PRICING'] as PolicyKind[]) {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ai_policy:${kind}`]);
      if (!(await repo.activePolicy(kind))) await repo.insertPolicy(kind, DEFAULTS[kind], 'Default development policy', null);
    }
  });
}

async function readPolicy<K extends PolicyKind>(q: Queryable, kind: K): Promise<{ version: number; body: (typeof DEFAULTS)[K] } | null> {
  const row = await new PostgresAiRepository(q).activePolicy<unknown>(kind);
  if (!row) return null;
  const parsed = SCHEMAS[kind].safeParse(row.body);
  if (!parsed.success) {
    // A stored policy that no longer validates must never silently loosen rules: fall back to defaults.
    logger.error({ kind, version: row.version }, 'Stored AI policy failed validation; using defaults');
    return { version: row.version, body: DEFAULTS[kind] };
  }
  return { version: row.version, body: parsed.data as (typeof DEFAULTS)[K] };
}

/** Active, validated policies (creating defaults on first use). */
export async function loadAiConfig(q: Queryable): Promise<AiConfig> {
  // Sequential on purpose: `q` may be a transaction client, which must not run queries concurrently.
  const read = async () => [await readPolicy(q, 'SETTINGS'), await readPolicy(q, 'SEVERITY'), await readPolicy(q, 'PRICING')] as const;
  let [s, sev, pr] = await read();
  if (!s || !sev || !pr) {
    await ensureDefaultPolicies();
    [s, sev, pr] = await read();
  }
  return { settings: s!.body, settingsVersion: s!.version, severity: sev!.body, severityVersion: sev!.version, pricing: pr!.body, pricingVersion: pr!.version };
}

/** Env kill switch (AI_ASSISTANT_ENABLED) AND owner feature flag. */
export function featureEnabled(cfg: AiConfig): boolean {
  return config().AI_ASSISTANT_ENABLED && cfg.settings.featureEnabled;
}

/** The provider for this request: owner "HUMAN_ONLY" mode always wins over the environment. */
export function providerFor(cfg: AiConfig): AiProvider {
  if (cfg.settings.providerMode === 'HUMAN_ONLY') return new NoAiProvider();
  return aiProvider(cfg.settings.modelName || undefined);
}
