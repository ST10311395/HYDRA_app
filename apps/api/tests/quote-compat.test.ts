/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
/**
 * Part 3 quotation regressions: the redesigned quote form sends new wording through the unchanged API
 * contract, records created with the old wording stay readable, and urgency values still drive triage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool } from '../src/db/pool';
import { SITE, api, loginAll, resetDatabase, type Fixture, type Tokens } from './helpers';

let f: Fixture;
let t: Tokens;

beforeAll(async () => {
  f = await resetDatabase();
  t = await loginAll(f);
});
afterAll(async () => {
  await closePool();
});

const enquiry = (o: Record<string, unknown>) => ({ name: 'Thabo Guest', email: 'thabo@example.com', phone: '+27 82 555 0100', message: 'Main breaker trips when the geyser switches on', consent: true, source: 'QUOTE_TOOL', ...o });

describe('quote enquiries before and after Part 3', () => {
  it('accepts the new quote form and an old-style enquiry, and the office reads both unchanged', async () => {
    const fresh = await api().post('/contact-queries', enquiry({ sector: 'Fault or repair (Commercial)', urgency: 'EMERGENCY', details: { sector: 'Fault or repair (Commercial)', scope: 'Breaker trips', siteAddress: '14 Marine Drive' } }));
    expect(fresh.status).toBe(201);
    // A different message: identical enquiries are deduplicated by the API.
    const legacy = await api().post('/contact-queries', enquiry({ message: 'Fibre backbone for the warehouse office', sector: 'Fiber & Data Cabling', urgency: 'HIGH', details: { sector: 'Fiber & Data Cabling', voltageLevel: 'Medium Voltage (11kV)', estimatedLoadKva: 480 } }));
    expect(legacy.status).toBe(201);

    const a = await api(t.office).get(`/contact-queries/${fresh.body.id}`).expect(200);
    expect(a.body).toMatchObject({ sector: 'Fault or repair (Commercial)', urgency: 'EMERGENCY' });
    const b = await api(t.office).get(`/contact-queries/${legacy.body.id}`).expect(200);
    expect(b.body).toMatchObject({ sector: 'Fiber & Data Cabling', urgency: 'HIGH' });
    expect(b.body.details).toMatchObject({ voltageLevel: 'Medium Voltage (11kV)', estimatedLoadKva: 480 });
  });

  it('a customer quote marked "Urgent fault" is stored as EMERGENCY and surfaces as urgent for the office', async () => {
    const job = await api(t.customerA).post('/jobs', {
      serviceTypeId: f.serviceTypeId, siteAddress: '1 Test Road, Durban', description: '[Fault or repair] Burning smell at the DB\nSite type: Commercial', urgency: 'EMERGENCY', contactConfirmed: true, siteLocation: SITE,
    });
    expect(job.status).toBe(201);
    expect(job.body.urgency).toBe('EMERGENCY');
    const dash = await api(t.office).get('/dashboard/admin').expect(200);
    expect(dash.body.urgentJobs.map((j: { id: string }) => j.id)).toContain(job.body.id);
  });
});
