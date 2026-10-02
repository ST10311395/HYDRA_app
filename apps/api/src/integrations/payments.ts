import { config } from '../config/env';
import { logger } from '../config/logger';
import { hmacHex, safeEqual } from '../utils/crypto';
import { AppError, serviceUnavailable, unauthorized } from '../utils/errors';

export interface CheckoutRequest {
  reference: string;
  amount: number;
  currency: string;
  email: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  providerReference: string;
  checkoutUrl: string;
}

export interface PaymentEvent {
  eventId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'ignored';
  eventType: string;
  providerReference: string | null;
  amount: number | null;
  currency: string | null;
  paidAt: Date | null;
  failureReason: string | null;
}

/**
 * PCI-DSS scope reduction (PDF §6.5): card entry happens on the gateway's hosted page; HYDRA only
 * receives references and signed webhooks. No card number/CVV ever touches HYDRA.
 */
export interface PaymentGateway {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verifies the webhook signature over the raw body and normalises the event. Throws on bad signature. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent;
}

const header = (h: Record<string, string | string[] | undefined>, name: string): string | undefined => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

/** Paystack (supports ZAR; use sk_test_* keys for sandbox). */
export class PaystackGateway implements PaymentGateway {
  readonly name = 'paystack';

  constructor(private readonly secretKey: string, private readonly baseUrl = 'https://api.paystack.co') {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: req.email,
        amount: Math.round(req.amount * 100),
        currency: req.currency,
        reference: req.reference,
        callback_url: req.callbackUrl,
        metadata: req.metadata,
        channels: ['card', 'eft', 'bank_transfer'],
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((err: unknown) => {
      logger.error({ err }, 'Paystack initialize request failed');
      throw serviceUnavailable('The payment gateway is unavailable. Please try again shortly.', 'PAYMENT_GATEWAY_UNAVAILABLE');
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } } | null;
    if (!res.ok || !body?.status || !body.data?.authorization_url) {
      logger.error({ status: res.status, message: body?.message }, 'Paystack initialize rejected');
      throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'The payment gateway rejected the checkout request');
    }
    return { providerReference: body.data.reference ?? req.reference, checkoutUrl: body.data.authorization_url };
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent {
    const signature = header(headers, 'x-paystack-signature');
    const expected = hmacHex('sha512', this.secretKey, rawBody);
    if (!signature || !safeEqual(signature, expected)) throw unauthorized('Invalid webhook signature');
    const evt = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: { id: number; reference: string; amount: number; currency: string; paid_at?: string; gateway_response?: string; status?: string };
    };
    const base = {
      eventId: `${evt.event}:${evt.data?.id ?? evt.data?.reference}`,
      eventType: evt.event,
      providerReference: evt.data?.reference ?? null,
      amount: typeof evt.data?.amount === 'number' ? evt.data.amount / 100 : null,
      currency: evt.data?.currency ?? null,
    };
    if (evt.event === 'charge.success' && evt.data.status === 'success') {
      return { ...base, type: 'payment.succeeded', paidAt: evt.data.paid_at ? new Date(evt.data.paid_at) : new Date(), failureReason: null };
    }
    if (evt.event === 'charge.failed') {
      return { ...base, type: 'payment.failed', paidAt: null, failureReason: evt.data.gateway_response ?? 'Declined' };
    }
    return { ...base, type: 'ignored', paidAt: null, failureReason: null };
  }
}

/**
 * DEVELOPMENT SANDBOX ONLY. Hosts a local checkout page and emits HMAC-signed webhooks through the
 * exact same verification + settlement pipeline as a real gateway. `assertProductionSafety` refuses
 * this provider when NODE_ENV=production, so it can never fake a real payment.
 */
export class SimulatedGateway implements PaymentGateway {
  readonly name = 'simulated';

  constructor(private readonly webhookSecret: string, private readonly baseUrl: string) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    return {
      providerReference: req.reference,
      checkoutUrl: `${this.baseUrl}/api/v1/payments/sandbox/checkout/${encodeURIComponent(req.reference)}`,
    };
  }

  sign(rawBody: string): string {
    return hmacHex('sha256', this.webhookSecret, rawBody);
  }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent {
    const signature = header(headers, 'x-hydra-signature');
    if (!signature || !safeEqual(signature, hmacHex('sha256', this.webhookSecret, rawBody))) {
      throw unauthorized('Invalid webhook signature');
    }
    const evt = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: 'payment.succeeded' | 'payment.failed';
      reference: string;
      amount: number;
      currency: string;
      reason?: string;
    };
    return {
      eventId: evt.id,
      eventType: evt.type,
      type: evt.type === 'payment.succeeded' || evt.type === 'payment.failed' ? evt.type : 'ignored',
      providerReference: evt.reference,
      amount: evt.amount,
      currency: evt.currency,
      paidAt: evt.type === 'payment.succeeded' ? new Date() : null,
      failureReason: evt.reason ?? null,
    };
  }
}

/**
 * What a customer's payment actually does, for honest UI copy: the development simulator and
 * Paystack test keys never move real money; only a live Paystack key does.
 */
export function paymentMode(): 'simulated' | 'test' | 'live' {
  const cfg = config();
  if (cfg.PAYMENT_PROVIDER !== 'paystack') return 'simulated';
  return cfg.PAYMENT_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test';
}

export function createPaymentGateway(): PaymentGateway {
  const cfg = config();
  if (cfg.PAYMENT_PROVIDER === 'paystack') {
    if (!cfg.PAYMENT_SECRET_KEY) throw new Error('PAYMENT_SECRET_KEY is required for PAYMENT_PROVIDER=paystack');
    return new PaystackGateway(cfg.PAYMENT_SECRET_KEY);
  }
  if (cfg.isProduction) throw new Error('Simulated payments are not permitted in production');
  return new SimulatedGateway(cfg.webhookSecret, cfg.PUBLIC_API_BASE_URL);
}
