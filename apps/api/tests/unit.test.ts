import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../src/config/cors';
import { loadConfig } from '../src/config/env';
import { GoogleAuthLibraryVerifier } from '../src/integrations/google';
import { PaystackGateway, SimulatedGateway } from '../src/integrations/payments';
import { hmacHex, maskPhone, toE164 } from '../src/utils/crypto';
import { toCsv } from '../src/utils/csv';
import { likePattern } from '../src/utils/pagination';
import { distanceMetres, parseQrPayload } from '../src/services/dispatchService';
import { sniffMime } from '../src/services/fileService';
import { classify } from '../src/services/missedCallService';
import { parseDuration, signAccessToken, verifyAccessToken } from '../src/services/tokenService';

describe('configuration safety', () => {
  const prod = {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    FILE_URL_SIGNING_SECRET: 'c'.repeat(40),
    PAYMENT_PROVIDER: 'paystack',
    PAYMENT_SECRET_KEY: 'sk_live_x',
    EMAIL_PROVIDER: 'smtp',
    PUBLIC_API_BASE_URL: 'https://api.example.co.za',
    DATABASE_SSL: 'true',
  };
  it('accepts a complete production configuration', () => {
    expect(loadConfig(prod).isProduction).toBe(true);
  });
  it('refuses simulated payments, console email, http URLs and default secrets in production', () => {
    expect(() => loadConfig({ ...prod, PAYMENT_PROVIDER: 'simulated' })).toThrow(/simulated/);
    expect(() => loadConfig({ ...prod, EMAIL_PROVIDER: 'console' })).toThrow(/console/);
    expect(() => loadConfig({ ...prod, PUBLIC_API_BASE_URL: 'http://api.example.co.za' })).toThrow(
      /https/,
    );
    expect(() => loadConfig({ ...prod, JWT_ACCESS_SECRET: undefined })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() => loadConfig({ ...prod, DATABASE_SSL: 'false' })).toThrow(/DATABASE_SSL/);
    expect(() => loadConfig({ ...prod, JWT_REFRESH_SECRET: prod.JWT_ACCESS_SECRET })).toThrow(
      /differ/,
    );
  });
});

describe('local development networking', () => {
  it('binds to all interfaces by default so LAN devices can connect', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).HOST).toBe('0.0.0.0');
    expect(loadConfig({ NODE_ENV: 'development' }).PORT).toBe(4000);
  });

  it('accepts loopback and private-LAN origins in development only', () => {
    const dev = { CORS_ORIGINS: ['http://localhost:8081'], isProduction: false };
    for (const o of [
      'http://localhost:8081',
      'http://localhost:19006',
      'http://127.0.0.1:8081',
      'http://10.117.231.194:8081',
      'http://192.168.1.20:8081',
      'http://172.20.0.5:8081',
    ]) {
      expect(isAllowedOrigin(o, dev)).toBe(true);
    }
    for (const o of [
      'https://evil.example.com',
      'http://8.8.8.8:8081',
      'http://172.32.0.1:8081',
      'file://x',
      'not a url',
    ]) {
      expect(isAllowedOrigin(o, dev)).toBe(false);
    }
    expect(isAllowedOrigin(undefined, dev)).toBe(true); // native apps send no Origin
    const prod = { CORS_ORIGINS: ['https://app.psg.example'], isProduction: true };
    expect(isAllowedOrigin('https://app.psg.example', prod)).toBe(true);
    expect(isAllowedOrigin('http://localhost:8081', prod)).toBe(false);
    expect(isAllowedOrigin('http://192.168.1.20:8081', prod)).toBe(false);
  });

  it('keeps every external integration in safe development mode by default', () => {
    const cfg = loadConfig({ NODE_ENV: 'development' });
    expect(cfg.PAYMENT_PROVIDER).toBe('simulated');
    expect(cfg.SMS_PROVIDER).toBe('none');
    expect(cfg.WHATSAPP_PROVIDER).toBe('none');
    expect(cfg.EMAIL_PROVIDER).toBe('console');
    expect(cfg.STORAGE_PROVIDER).toBe('local');
    expect(cfg.googleClientIds).toEqual([]);
  });

  it('reports Google Sign-In as not configured (503) when no client IDs are set', async () => {
    const verifier = new GoogleAuthLibraryVerifier([]);
    expect(verifier.configured).toBe(false);
    await expect(verifier.verify('any-token')).rejects.toMatchObject({
      status: 503,
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  });
});

describe('tokens', () => {
  it('parses TTL durations', () => {
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('30d')).toBe(2_592_000_000);
    expect(() => parseDuration('forever')).toThrow();
  });
  it('signs and verifies access tokens with minimal claims', async () => {
    const { token } = await signAccessToken({
      sub: 'u1',
      role: 'CUSTOMER',
      cid: 'c1',
      eid: null,
      aid: null,
      sid: 's1',
      tv: 3,
    });
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual({
      sub: 'u1',
      role: 'CUSTOMER',
      cid: 'c1',
      eid: null,
      aid: null,
      sid: 's1',
      tv: 3,
    });
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual([
      'aid',
      'aud',
      'cid',
      'eid',
      'exp',
      'iat',
      'iss',
      'jti',
      'role',
      'sid',
      'sub',
      'tv',
    ]);
    await expect(verifyAccessToken(`${token.slice(0, -2)}xx`)).rejects.toThrow();
  });
});

describe('dispatch helpers', () => {
  it('parses QR payloads', () => {
    expect(parseQrPayload('HYDRA1:6f0e3c1e-1111-4111-8111-111111111111:tok123')).toEqual({
      jobId: '6f0e3c1e-1111-4111-8111-111111111111',
      token: 'tok123',
    });
    expect(parseQrPayload('  rawtoken ')).toEqual({ jobId: null, token: 'rawtoken' });
    expect(() => parseQrPayload('HYDRA1::')).toThrow();
  });
  it('computes GPS distances', () => {
    expect(distanceMetres({ lat: -29.72, lng: 31.06 }, { lat: -29.72, lng: 31.06 })).toBe(0);
    const d = distanceMetres({ lat: -26.2041, lng: 28.0473 }, { lat: -29.8587, lng: 31.0218 });
    expect(d).toBeGreaterThan(490_000);
    expect(d).toBeLessThan(510_000);
  });
});

describe('missed-call classification (human in the loop)', () => {
  const tpl = 'Hi{{name}}, we missed your call.';
  it('auto-replies only for known customers', () => {
    expect(classify({ customerId: null, firstName: null, openJob: null }, tpl)).toMatchObject({
      classification: 'UNKNOWN_CALLER',
      auto: false,
      message: 'Hi, we missed your call.',
    });
    expect(classify({ customerId: 'c', firstName: 'Lerato', openJob: null }, tpl)).toMatchObject({
      classification: 'KNOWN_CUSTOMER',
      auto: true,
      message: 'Hi Lerato, we missed your call.',
    });
    const open = classify(
      {
        customerId: 'c',
        firstName: 'Lerato',
        openJob: { reference: 'HYD-001', status: 'SCHEDULED' },
      },
      tpl,
    );
    expect(open.classification).toBe('OPEN_JOB_STATUS');
    expect(open.message).toContain('HYD-001');
    expect(open.message).toContain('Scheduled');
  });
});

describe('utilities', () => {
  it('neutralises CSV formula injection and escapes quotes', () => {
    const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', 'he said "hi", ok']]);
    expect(csv).toBe(`a,b\r\n"'=HYPERLINK(""x"")","he said ""hi"", ok"\r\n`);
  });
  it('escapes LIKE wildcards in search input', () => {
    expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });
  it('normalises and masks phone numbers', () => {
    expect(toE164('082 555 1234')).toBe('+27825551234');
    expect(toE164('+27 (11) 987-6500')).toBe('+27119876500');
    expect(maskPhone('+27825551234')).toBe('*******1234');
  });
  it('sniffs file types from magic bytes', () => {
    expect(sniffMime(Buffer.from('ffd8ffe000104a4649460001', 'hex'))?.mime).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('%PDF-1.7 hello world'))?.mime).toBe('application/pdf');
    expect(sniffMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
  });
});

describe('payment gateways', () => {
  it('Paystack webhook requires a valid HMAC-SHA512 signature', () => {
    const gw = new PaystackGateway('sk_test_secret');
    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: 1,
          reference: 'HYD-1',
          amount: 150050,
          currency: 'ZAR',
          status: 'success',
          paid_at: '2026-09-01T10:00:00Z',
        },
      }),
    );
    expect(() => gw.parseWebhook(body, { 'x-paystack-signature': 'bad' })).toThrow();
    const evt = gw.parseWebhook(body, {
      'x-paystack-signature': hmacHex('sha512', 'sk_test_secret', body),
    });
    expect(evt).toMatchObject({
      type: 'payment.succeeded',
      providerReference: 'HYD-1',
      amount: 1500.5,
      currency: 'ZAR',
      eventId: 'charge.success:1',
    });
  });
  it('simulated gateway signs and verifies its own events', () => {
    const gw = new SimulatedGateway('dev-secret', 'http://localhost:4000');
    const payload = JSON.stringify({
      id: 'e1',
      type: 'payment.failed',
      reference: 'HYD-2',
      amount: 10,
      currency: 'ZAR',
      reason: 'Declined',
    });
    expect(
      gw.parseWebhook(Buffer.from(payload), { 'x-hydra-signature': gw.sign(payload) }),
    ).toMatchObject({ type: 'payment.failed', failureReason: 'Declined' });
    expect(() =>
      gw.parseWebhook(Buffer.from(payload), { 'x-hydra-signature': gw.sign(`${payload} `) }),
    ).toThrow();
  });
});
