/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
/**
 * Part 3 public content: the seed makes no 24/7 / dispatch / certification promises, and the refresh
 * script corrects a database seeded before Part 3 without touching jobs or service ids.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, db, withTransaction } from '../src/db/pool';
import { DEPARTMENTS, FAQS, OFFICES, PUBLIC_CONTENT, SERVICE_TYPES } from '../seeds/content';
import { refreshPublicContent } from '../seeds/content-refresh';
import { DEFAULT_SEVERITY_POLICY } from '../src/ai/policies';
import { api, resetDatabase } from './helpers';

const FORBIDDEN = /24\/7|24-hour|24 hours|\(24h\)|around the clock|immediate (dispatch|response)|rapid dispatch|live dispatch|hotline|within (an? |one |\d+ )?(business )?hours?|guarantee|binding|ISO 9001|accredit|certified|master electrician|60[- ]min/i;

/** Every string value (not the keys) — the customer-facing copy. */
const allText = (v: unknown): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? v.map(allText).join(' | ') : v && typeof v === 'object' ? Object.values(v).map(allText).join(' | ') : '';

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await closePool();
});

describe('Part 3 seed content', () => {
  it('makes no availability, response-time or certification claims', () => {
    for (const [name, value] of Object.entries({ PUBLIC_CONTENT, SERVICE_TYPES, OFFICES, DEPARTMENTS, FAQS })) {
      expect(allText(value), name).not.toMatch(FORBIDDEN);
    }
  });

  it('uses the owner-confirmed contact details and publishes no unverified metrics', () => {
    expect(PUBLIC_CONTENT.company.hotline).toBe('082 603 9283');
    expect(PUBLIC_CONTENT.company.whatsapp).toBe('082 603 9283');
    expect(PUBLIC_CONTENT.company.email).toBe('info@psgelectrical.co.za');
    expect(PUBLIC_CONTENT.metrics).toEqual([]);
    expect(PUBLIC_CONTENT.accreditations).toEqual([]);
    expect(PUBLIC_CONTENT.testimonial).toBeNull();
  });

  it('keeps every service slug and category so existing jobs, quotes and AI policies still resolve', () => {
    expect(SERVICE_TYPES.map((s) => `${s.slug}:${s.category}`)).toEqual([
      'commercial-solar-micro-grids:SOLAR',
      'industrial-cabling-fibre:CABLING',
      'hv-substations-distribution:SUBSTATIONS',
      'emergency-repairs-diagnostics:EMERGENCY',
      'coc-audits:COMPLIANCE',
      'smart-energy-automation:AUTOMATION',
    ]);
  });

  it('FAQs give the owner-confirmed hours, both emails and a workmanship-only warranty', () => {
    const text = allText(FAQS);
    expect(text).toContain('Monday to Friday, 07:00–18:00');
    expect(text).toContain('info@psgelectrical.co.za');
    expect(text).toContain('trite@polka.co.za');
    expect(text).toMatch(/12-month warranty\. It covers workmanship only, not supplied equipment or materials/);
    expect(text).not.toMatch(/keoran@|tritesolar/);
  });

  it('AI triage uses Monday–Friday 07:00–18:00 office hours', () => {
    expect(DEFAULT_SEVERITY_POLICY.businessHours).toMatchObject({ days: [1, 2, 3, 4, 5], start: '07:00', end: '18:00' });
  });

  it('AI triage wording no longer promises 24-hour or 24/7 responses', () => {
    expect(allText(DEFAULT_SEVERITY_POLICY)).not.toMatch(/24\/7|24 hours|alerted immediately/i);
    expect(DEFAULT_SEVERITY_POLICY.levels.map((l) => l.jobUrgency)).toEqual(['STANDARD', 'STANDARD', 'HIGH', 'EMERGENCY', 'EMERGENCY']);
  });
});

describe('Part 3 content refresh for an existing database', () => {
  it('rewords old seeded content by slug, keeps ids, and clears invented offices and FAQs', async () => {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO service_types (slug, name, category, description, base_price, sla_text, badge)
       VALUES ('emergency-repairs-diagnostics', '24/7 Emergency Repairs & Diagnostics', 'EMERGENCY', 'Rapid-dispatch electricians', 1450, 'SLA: Immediate Dispatch (60m)', '60-Min Emergency SLA') RETURNING id`,
    );
    const serviceId = rows[0]!.id;
    await db().query(`INSERT INTO offices (region, name, area, address, phone, email, manager, hours, display_order) VALUES ('Gauteng', 'HQ', 'Sandton', '14 Commerce Crescent', '+27 11 987 6500', 'x@psg.test', null, 'Mon-Fri | 24/7 Hotline', 0)`);
    await db().query(`INSERT INTO faqs (question, answer, category, display_order) VALUES ('How fast is 24/7 emergency response?', 'Under 60 minutes.', 'CONTACT', 1)`);

    const result = await withTransaction((tx) => refreshPublicContent(tx));
    expect(result.servicesUpdated).toBe(1);

    const svc = (await api().get(`/service-types/${serviceId}`).expect(200)).body;
    expect(svc.id).toBe(serviceId);
    expect(svc.category).toBe('EMERGENCY');
    expect(svc.basePrice).toBe(1450);
    expect(svc.name).toBe('Fault Finding');
    expect(svc.slaText).toBeNull();
    expect((await api().get('/offices').expect(200)).body).toEqual([]);
    const faqs = (await api().get('/faqs').expect(200)).body as { question: string; answer: string }[];
    expect(faqs.length).toBe(FAQS.length);
    expect(allText(faqs)).not.toMatch(FORBIDDEN);
    const content = (await api().get('/public-content').expect(200)).body;
    expect(content.company.hotline).toBe('082 603 9283');
    expect(content.isDemoContent).toBe(false);
  });
});
