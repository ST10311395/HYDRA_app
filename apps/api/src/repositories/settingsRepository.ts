/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 * Martin, R.C. 2017. Clean Architecture: A craftsman’s guide to software structure and design. Boston: Prentice Hall.
 */
import type { MessageChannel, SettingsDto, SettingsUpdateInput } from '@hydra/shared';
import type { Queryable } from '../db/pool';

export type BusinessSettings = Omit<SettingsDto, 'integrations'>;

export const DEFAULT_SETTINGS: BusinessSettings = {
  missedCallAutomationEnabled: false,
  missedCallAutoReplyTemplate:
    'Hi{{name}}, you called PSG Electrical & Cables and we missed you. An engineer will call you back shortly. For emergencies call our 24/7 line. Reply STOP to opt out.',
  missedCallDefaultChannel: 'SMS' as MessageChannel,
  rewardsRandPerPoint: 10,
  vatRate: 0.15,
  payrollRequirePaidInvoice: true,
  invoiceIncludeMaterialVariance: false,
  lowStockAlertsEnabled: true,
};

export interface ISettingsRepository {
  getAll(): Promise<BusinessSettings>;
  update(input: SettingsUpdateInput, userId: string): Promise<BusinessSettings>;
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, userId: string | null): Promise<void>;
}

export class PostgresSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Queryable) {}

  async getAll(): Promise<BusinessSettings> {
    const { rows } = await this.db.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
      [Object.keys(DEFAULT_SETTINGS)],
    );
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out as unknown as BusinessSettings;
  }

  async update(input: SettingsUpdateInput, userId: string): Promise<BusinessSettings> {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || !(key in DEFAULT_SETTINGS)) continue;
      await this.setJson(key, value, userId);
    }
    return this.getAll();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const { rows } = await this.db.query<{ value: T }>('SELECT value FROM app_settings WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async setJson(key: string, value: unknown, userId: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), userId],
    );
  }
}
