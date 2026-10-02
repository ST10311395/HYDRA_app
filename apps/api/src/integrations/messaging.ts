import type { DeliveryStatus, MessageChannel } from '@hydra/shared';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface SendResult {
  status: DeliveryStatus;
  provider: string;
  providerMessageId: string | null;
  error: string | null;
}

export interface MessagingProvider {
  readonly channel: MessageChannel;
  readonly configured: boolean;
  send(toE164: string, body: string): Promise<SendResult>;
}

/** Twilio Programmable Messaging (SMS or WhatsApp). API key format: ACCOUNT_SID:AUTH_TOKEN. */
export class TwilioProvider implements MessagingProvider {
  readonly configured = true;

  constructor(
    readonly channel: MessageChannel,
    private readonly credentials: string,
    private readonly from: string,
  ) {}

  async send(toE164: string, body: string): Promise<SendResult> {
    const [sid, token] = this.credentials.split(':');
    if (!sid || !token) return { status: 'FAILED', provider: 'twilio', providerMessageId: null, error: 'Invalid Twilio credentials format' };
    const prefix = this.channel === 'WHATSAPP' ? 'whatsapp:' : '';
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `${prefix}${toE164}`, From: `${prefix}${this.from}`, Body: body }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; status?: string };
      if (!res.ok) {
        // Provider payloads are reduced to a short message — never logged in full (spec §11).
        return { status: 'FAILED', provider: 'twilio', providerMessageId: null, error: (json.message ?? `HTTP ${res.status}`).slice(0, 300) };
      }
      return { status: 'SENT', provider: 'twilio', providerMessageId: json.sid ?? null, error: null };
    } catch (err) {
      logger.warn({ channel: this.channel, err: (err as Error).message }, 'Messaging provider request failed');
      return { status: 'FAILED', provider: 'twilio', providerMessageId: null, error: 'Provider unreachable' };
    }
  }
}

/** No provider configured: the message is logged for review but honestly recorded as NOT_CONFIGURED. */
export class UnconfiguredProvider implements MessagingProvider {
  readonly configured = false;

  constructor(readonly channel: MessageChannel) {}

  async send(): Promise<SendResult> {
    return { status: 'NOT_CONFIGURED', provider: 'none', providerMessageId: null, error: `${this.channel} provider is not configured` };
  }
}

export function createMessagingProviders(): Record<MessageChannel, MessagingProvider> {
  const cfg = config();
  const sms =
    cfg.SMS_PROVIDER === 'twilio' && cfg.SMS_API_KEY && cfg.SMS_FROM_NUMBER
      ? new TwilioProvider('SMS', cfg.SMS_API_KEY, cfg.SMS_FROM_NUMBER)
      : new UnconfiguredProvider('SMS');
  const whatsapp =
    cfg.WHATSAPP_PROVIDER === 'twilio' && cfg.WHATSAPP_API_KEY && cfg.WHATSAPP_FROM_NUMBER
      ? new TwilioProvider('WHATSAPP', cfg.WHATSAPP_API_KEY, cfg.WHATSAPP_FROM_NUMBER)
      : new UnconfiguredProvider('WHATSAPP');
  return { SMS: sms, WHATSAPP: whatsapp };
}
