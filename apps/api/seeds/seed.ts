/**
 * Development seed (spec §25). Refuses to run in production. Demo lifecycle data is produced by
 * calling the real service layer (quotes, assignment, QR check-in, materials, inspection, invoicing,
 * payment settlement), so the seed doubles as an end-to-end smoke test of the business rules.
 *
 * Passwords are never committed: SEED_DEMO_PASSWORD is used if set, otherwise a random password is
 * generated and printed once.
 */
import { randomBytes } from 'node:crypto';
import type { Role } from '@hydra/shared';
import { config } from '../src/config/env';
import { closePool, db, withTransaction, type Queryable } from '../src/db/pool';
import { PostgresSettingsRepository } from '../src/repositories/settingsRepository';
import { PostgresUserRepository } from '../src/repositories/userRepository';
import { SYSTEM_ACTOR, type Actor } from '../src/services/auditService';
import { hashPassword } from '../src/services/authService';
import { recordManualPayment, generateInvoice } from '../src/services/billingService';
import { adminConfirmArrival, assignJob, checkIn, issueQr } from '../src/services/dispatchService';
import { submitEnquiry } from '../src/services/enquiryService';
import { logMaterials } from '../src/services/inventoryService';
import { createJob, completeWork, submitInspection, addNote } from '../src/services/jobService';
import { logMissedCall } from '../src/services/missedCallService';
import { createQuote, respondToQuote } from '../src/services/quoteService';
import { decideLeave, requestLeave } from '../src/services/workforceService';
import type { AuthContext } from '../src/types/express';
import { addDays, businessDayStart, todayIso } from '../src/utils/dates';
import { DEPARTMENTS, FAQS, MATERIALS, OFFICES, PARTNERS, PORTFOLIO, PUBLIC_CONTENT, SERVICE_TYPES, TEAM } from './content';

interface SeedUser {
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  employee?: { certificationNo: string; specialisation: string; hourlyRate: number; taxRate: number };
  address?: string;
}

const USERS: SeedUser[] = [
  { role: 'ADMIN_OWNER', email: 'owner@hydra.demo', firstName: 'Thandi', lastName: 'Mokoena', phone: '+27 82 555 0101' },
  { role: 'ADMIN_OFFICE', email: 'office@hydra.demo', firstName: 'Priya', lastName: 'Naidoo', phone: '+27 82 555 0102' },
  { role: 'EMPLOYEE', email: 'sipho@hydra.demo', firstName: 'Sipho', lastName: 'Dlamini', phone: '+27 82 555 0201', employee: { certificationNo: 'MIE-2019-0441', specialisation: 'Installation Electrician · CoC', hourlyRate: 235, taxRate: 0.18 } },
  { role: 'EMPLOYEE', email: 'anele@hydra.demo', firstName: 'Anele', lastName: 'Zulu', phone: '+27 82 555 0202', employee: { certificationNo: 'PV-GC-2021-118', specialisation: 'Solar PV & BESS', hourlyRate: 210, taxRate: 0.16 } },
  { role: 'EMPLOYEE', email: 'ruan@hydra.demo', firstName: 'Ruan', lastName: 'Botha', phone: '+27 82 555 0203', employee: { certificationNo: 'MW-2015-0873', specialisation: 'MV Cabling & Substations', hourlyRate: 260, taxRate: 0.21 } },
  { role: 'CUSTOMER', email: 'customer@hydra.demo', firstName: 'Lerato', lastName: 'Khumalo', phone: '+27 83 555 0301', address: '12 Protea Avenue, Umhlanga, 4320' },
  { role: 'CUSTOMER', email: 'ayanda@hydra.demo', firstName: 'Ayanda', lastName: 'Mthembu', phone: '+27 83 555 0302', address: '88 Florida Road, Morningside, Durban, 4001' },
];

async function seedContent(q: Queryable): Promise<Map<string, string>> {
  const serviceIds = new Map<string, string>();
  let order = 0;
  for (const s of SERVICE_TYPES) {
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO service_types (slug, name, category, description, base_price, sla_text, badge, image_key, specs, features, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [s.slug, s.name, s.category, s.description, s.basePrice, s.slaText, s.badge, s.imageKey, JSON.stringify(s.specs), JSON.stringify(s.features), order++],
    );
    serviceIds.set(s.slug, rows[0]!.id);
  }
  for (const p of PORTFOLIO) {
    await q.query(
      `INSERT INTO portfolio_items (service_type_id, title, client_name, location, category, description, image_key, completed_date, featured, highlights, spec_badge, accreditation, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)`,
      [serviceIds.get(p.serviceSlug), p.title, p.clientName, p.location, p.category, p.description, p.imageKey, p.completedDate, p.featured, JSON.stringify(p.highlights), p.specBadge, p.accreditation],
    );
  }
  order = 0;
  for (const p of PARTNERS) {
    await q.query(
      `INSERT INTO partners (name, category, established_year, description, tags, certification, guarantee, logo_key, display_order, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
      [p.name, p.category, p.year, p.description, JSON.stringify(p.tags), p.certification, p.guarantee, p.logoKey, order++],
    );
  }
  order = 0;
  for (const t of TEAM) {
    await q.query(
      `INSERT INTO team_members (name, title, category, rating, registration, licence, skills, experience_years, projects_count, lead_project, availability, photo_key, display_order, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)`,
      [t.name, t.title, t.category, t.rating, t.registration, t.licence, JSON.stringify(t.skills), t.years, t.projects, t.lead, t.availability, t.photoKey, order++],
    );
  }
  order = 0;
  for (const o of OFFICES) {
    await q.query(
      `INSERT INTO offices (region, name, area, address, phone, email, manager, hours, latitude, longitude, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [o.region, o.name, o.area, o.address, o.phone, o.email, o.manager, o.hours, o.lat, o.lng, order++],
    );
  }
  order = 0;
  for (const d of DEPARTMENTS) {
    await q.query(`INSERT INTO department_contacts (name, email, phone, sla, icon, display_order) VALUES ($1,$2,$3,$4,$5,$6)`, [d.name, d.email, d.phone, d.sla, d.icon, order++]);
  }
  const faqOrder: Record<string, number> = {};
  for (const f of FAQS) {
    faqOrder[f.category] = (faqOrder[f.category] ?? 0) + 1;
    await q.query('INSERT INTO faqs (question, answer, category, display_order) VALUES ($1,$2,$3,$4)', [f.q, f.a, f.category, faqOrder[f.category]]);
  }
  for (const m of MATERIALS) {
    const { rows } = await q.query<{ id: string }>(
      `INSERT INTO materials (sku, name, unit, unit_cost, stock_level, reorder_level, supplier_name) VALUES ($1,$2,$3,$4,0,$5,$6) RETURNING id`,
      [m.sku, m.name, m.unit, m.unitCost, m.reorder, m.supplier],
    );
    const owner = await q.query<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN_OWNER' LIMIT 1`);
    await q.query('UPDATE materials SET stock_level = $2 WHERE id = $1', [rows[0]!.id, m.stock]);
    await q.query(
      `INSERT INTO stock_movements (material_id, delta, reason, stock_after, actor_user_id, note) VALUES ($1,$2,'RESTOCK',$2,$3,'Opening stock (seed)')`,
      [rows[0]!.id, m.stock, owner.rows[0]!.id],
    );
  }
  await new PostgresSettingsRepository(q).setJson('publicContent', PUBLIC_CONTENT, null);
  const owner = await q.query<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN_OWNER' LIMIT 1`);
  await q.query(
    `INSERT INTO discounts (code, description, discount_type, value, points_cost, min_spend, valid_from, valid_until, created_by) VALUES
      ('LOYAL10', '10% off your next invoice', 'PERCENT', 10, 500, 1000, CURRENT_DATE - 30, CURRENT_DATE + 365, $1),
      ('SAVE250', 'R250 off any invoice over R1 500', 'FIXED', 250, 250, 1500, CURRENT_DATE - 30, CURRENT_DATE + 365, $1),
      ('COC-500', 'R500 off a Certificate of Compliance audit', 'FIXED', 500, 800, 1800, CURRENT_DATE - 30, CURRENT_DATE + 180, $1)`,
    [owner.rows[0]!.id],
  );
  return serviceIds;
}

function ctxFor(u: { id: string; role: Role; customerId: string | null; employeeId: string | null; adminId: string | null }): AuthContext {
  return { userId: u.id, role: u.role, customerId: u.customerId, employeeId: u.employeeId, adminId: u.adminId, sessionId: 'seed' };
}

const actorOf = (a: AuthContext): Actor => ({ userId: a.userId, role: a.role, requestId: 'seed', ip: '127.0.0.1', auth: a });

/** A scheduled window on `date` at `hour` (SAST) lasting `hours`. */
function windowOn(date: string, hour: number, hours: number): { start: string; end: string } {
  const start = new Date(businessDayStart(date).getTime() + hour * 3_600_000);
  return { start: start.toISOString(), end: new Date(start.getTime() + hours * 3_600_000).toISOString() };
}

const SITE = { latitude: -29.7274, longitude: 31.0694, accuracy: 8 };
const CHECKLIST = [
  { key: 'earth', label: 'Earth continuity', result: 'PASS' as const, reading: '0.21Ω' },
  { key: 'insulation', label: 'Insulation resistance', result: 'PASS' as const, reading: '>200MΩ' },
  { key: 'elu', label: 'Earth leakage trip test', result: 'PASS' as const, reading: '24ms @ 30mA' },
  { key: 'polarity', label: 'Polarity & labelling', result: 'PASS' as const },
];

async function main(): Promise<void> {
  const cfg = config();
  if (cfg.isProduction) throw new Error('Refusing to seed demo data in production');
  const existing = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  if ((existing.rows[0]?.n ?? 0) > 0 && !process.argv.includes('--force')) {
    console.log('Database already contains users — skipping seed. Use `npm run db:reset` for a clean demo dataset.');
    return;
  }
  const password = cfg.SEED_DEMO_PASSWORD ?? `Hydra-${randomBytes(9).toString('base64url')}`;
  if (password.length < 12) throw new Error('SEED_DEMO_PASSWORD must be at least 12 characters');
  const passwordHash = await hashPassword(password);

  await withTransaction(async (tx) => {
    const users = new PostgresUserRepository(tx);
    for (const u of USERS) {
      const staffNumber = u.role === 'CUSTOMER' ? null : await users.nextStaffNumber(u.role);
      const id = await users.create({ email: u.email, passwordHash, role: u.role, staffNumber });
      if (u.role === 'CUSTOMER') {
        await users.createCustomerProfile(id, { firstName: u.firstName, lastName: u.lastName, phone: u.phone, address: u.address ?? null, marketingOptIn: false });
        await users.recordConsent(id, 'PRIVACY_POLICY', true);
      } else if (u.role === 'EMPLOYEE') {
        await users.createEmployeeProfile(id, { firstName: u.firstName, lastName: u.lastName, phone: u.phone, ...u.employee! });
        await users.completeOnboarding(id);
      } else {
        await users.createAdminProfile(id, { firstName: u.firstName, lastName: u.lastName, phone: u.phone });
        await users.completeOnboarding(id);
      }
    }
    await seedContent(tx);
  });

  const users = new PostgresUserRepository(db());
  const get = async (email: string) => ctxFor((await users.findByEmail(email))!);
  const owner = await get('owner@hydra.demo');
  const office = await get('office@hydra.demo');
  const sipho = await get('sipho@hydra.demo');
  const anele = await get('anele@hydra.demo');
  const ruan = await get('ruan@hydra.demo');
  const lerato = await get('customer@hydra.demo');
  const ayanda = await get('ayanda@hydra.demo');
  const svc = async (slug: string) => (await db().query<{ id: string }>('SELECT id FROM service_types WHERE slug = $1', [slug])).rows[0]!.id;
  const material = async (sku: string) => (await db().query<{ id: string }>('SELECT id FROM materials WHERE sku = $1', [sku])).rows[0]!.id;
  const today = todayIso();
  const quoteItems = (labourHours: number, materials: [string, number, number][]) => [
    { kind: 'LABOUR' as const, description: 'Certified electrician labour', quantity: labourHours, unitPrice: 480 },
    ...materials.map(([d, qty, price]) => ({ kind: 'MATERIAL' as const, description: d, quantity: qty, unitPrice: price })),
    { kind: 'FEE' as const, description: 'Call-out & compliance documentation', quantity: 1, unitPrice: 350 },
  ];
  const request = (who: AuthContext, slug: string, siteAddress: string, description: string, urgency: 'STANDARD' | 'HIGH' | 'EMERGENCY' = 'STANDARD') =>
    svc(slug).then((serviceTypeId) =>
      createJob(who, { serviceTypeId, siteAddress, description, urgency, preferredTimeWindow: 'ANY', contactConfirmed: true, attachmentIds: [], siteLocation: SITE }, actorOf(who)),
    );
  const quoteAndAccept = async (jobId: string, labour: number, mats: [string, number, number][], customer: AuthContext) => {
    const q = await createQuote(office, jobId, { items: quoteItems(labour, mats), discountAmount: 0, validUntil: addDays(today, 30), terms: 'Valid 30 days. 12-month workmanship guarantee.', send: true }, actorOf(office));
    await respondToQuote(customer, q.id, 'ACCEPT', undefined, actorOf(customer));
  };
  const assign = (jobId: string, emp: AuthContext, date: string, hour: number, hours: number) => {
    const w = windowOn(date, hour, hours);
    return assignJob(office, jobId, { employeeId: emp.employeeId!, scheduledStart: w.start, scheduledEnd: w.end, overrideConflicts: true }, actorOf(office));
  };
  const arriveByQr = async (jobId: string, customer: AuthContext, emp: AuthContext) => {
    const qr = await issueQr(customer, jobId);
    await checkIn(emp, jobId, { qrToken: qr.payload, location: SITE }, actorOf(emp));
  };

  // 1. REQUESTED — emergency, awaiting quote
  await request(lerato, 'emergency-repairs-diagnostics', '12 Protea Avenue, Umhlanga, 4320', 'Main DB trips repeatedly when the geyser and stove run together. Burning smell at the isolator.', 'EMERGENCY');
  // 2. QUOTED — solar quote waiting for the customer
  const j2 = await request(lerato, 'commercial-solar-micro-grids', '12 Protea Avenue, Umhlanga, 4320', 'Hybrid inverter with battery backup to ride through load-shedding for the whole house.');
  await createQuote(office, j2.id, { items: quoteItems(16, [['Hybrid Inverter 10kW', 1, 28500], ['LiFePO4 Battery 5.12kWh', 2, 21900], ['Bifacial PV Module 550W', 10, 2890]]), discountAmount: 1500, validUntil: addDays(today, 21), terms: 'Includes NRS 097 grid-tie documentation.', send: true }, actorOf(office));
  // 3. SCHEDULED tomorrow — customer can show QR
  const j3 = await request(lerato, 'coc-audits', '7 Ocean Way, Ballito, 4420', 'Certificate of Compliance required for property transfer (3-bedroom house).');
  await quoteAndAccept(j3.id, 3, [], lerato);
  await assign(j3.id, sipho, addDays(today, 1), 9, 3);
  // 4. SCHEDULED today — ready for the employee QR check-in demo
  const j4 = await request(ayanda, 'industrial-cabling-fibre', '88 Florida Road, Morningside, Durban, 4001', 'New 16mm² SWA feed to the backyard workshop (35m) including trenching.');
  await quoteAndAccept(j4.id, 6, [['SWA Cable 16mm² 4-Core', 35, 185.5]], ayanda);
  await assign(j4.id, sipho, today, 13, 4);
  // 5. IN_PROGRESS — checked in, materials logged, custom milestone
  const j5 = await request(ayanda, 'smart-energy-automation', 'Unit 4, Riverhorse Valley Business Estate, Durban', 'Replace warehouse lighting with LED high-bays and add power factor correction.', 'HIGH');
  await quoteAndAccept(j5.id, 12, [['LED High-Bay 150W', 12, 1690]], ayanda);
  await assign(j5.id, anele, today, 7, 8);
  await arriveByQr(j5.id, ayanda, anele);
  await logMaterials(anele, j5.id, { items: [{ materialId: await material('LED-HB-150W'), quantity: 12 }, { materialId: await material('CND-PVC-25'), quantity: 20 }], overrideStock: false }, actorOf(anele));
  await addNote(anele, j5.id, 'Old fittings removed; scissor lift on site until 16:00.', 'CUSTOMER', actorOf(anele));
  // 6. INVOICED — completed + certified, invoice awaiting payment (pay in app)
  const j6 = await request(lerato, 'coc-audits', '12 Protea Avenue, Umhlanga, 4320', 'Annual compliance inspection and replacement of faulty earth leakage.');
  await quoteAndAccept(j6.id, 4, [['Earth Leakage Unit 63A 30mA', 1, 645]], lerato);
  await assign(j6.id, ruan, addDays(today, -2), 8, 4);
  await adminConfirmArrival(office, j6.id, 'Customer phone camera faulty — arrival confirmed by phone call', undefined, actorOf(office));
  await logMaterials(ruan, j6.id, { items: [{ materialId: await material('BRK-ELU-63A'), quantity: 1 }], overrideStock: false }, actorOf(ruan));
  await completeWork(ruan, j6.id, 'ELU replaced and full installation tested.', actorOf(ruan));
  await submitInspection(ruan, j6.id, { complianceStatus: 'PASS', certificateNumber: `COC-${today.replace(/-/g, '')}-0601`, findings: 'Installation compliant with SANS 10142-1 after ELU replacement.', checklist: CHECKLIST, signatureName: 'Ruan Botha', confirmed: true, attachmentIds: [] }, actorOf(ruan));
  await generateInvoice(office, j6.id, { dueDate: addDays(today, 14), includeMaterialVariance: false, send: true }, actorOf(office));
  // 7. PAID — full lifecycle incl. manual EFT settlement → rewards credited
  const j7 = await request(lerato, 'emergency-repairs-diagnostics', '12 Protea Avenue, Umhlanga, 4320', 'Outdoor lights and plugs dead after storm.');
  await quoteAndAccept(j7.id, 5, [['Surge Arrester Type 2 40kA', 1, 1480]], lerato);
  await assign(j7.id, sipho, addDays(today, -6), 10, 3);
  await arriveByQr(j7.id, lerato, sipho);
  await logMaterials(sipho, j7.id, { items: [{ materialId: await material('SPD-T2-40KA'), quantity: 1 }], overrideStock: false }, actorOf(sipho));
  await completeWork(sipho, j7.id, 'Surge arrester fitted; lightning damaged cabling replaced.', actorOf(sipho));
  await submitInspection(sipho, j7.id, { complianceStatus: 'PASS', certificateNumber: `COC-${today.replace(/-/g, '')}-0701`, findings: 'Storm damage repaired. Surge protection installed.', checklist: CHECKLIST, signatureName: 'Sipho Dlamini', confirmed: true, attachmentIds: [] }, actorOf(sipho));
  const inv7 = await generateInvoice(office, j7.id, { dueDate: addDays(today, 7), includeMaterialVariance: false, send: true }, actorOf(office));
  await recordManualPayment(office, inv7.id, { amount: inv7.amountDue, method: 'EFT', reference: 'FNB-EFT-77812', paidOn: today }, actorOf(office));
  // 8. PARTIALLY_PAID — deposit received
  const j8 = await request(ayanda, 'commercial-solar-micro-grids', '88 Florida Road, Morningside, Durban, 4001', 'Add two batteries to existing inverter system.');
  await quoteAndAccept(j8.id, 6, [['LiFePO4 Battery 5.12kWh', 2, 21900]], ayanda);
  await assign(j8.id, anele, addDays(today, -4), 8, 6);
  await arriveByQr(j8.id, ayanda, anele);
  await completeWork(anele, j8.id, 'Batteries installed and BMS communication verified.', actorOf(anele));
  await submitInspection(anele, j8.id, { complianceStatus: 'PASS', certificateNumber: `COC-${today.replace(/-/g, '')}-0801`, findings: 'Battery installation compliant; DC isolation labelled.', checklist: CHECKLIST, signatureName: 'Anele Zulu', confirmed: true, attachmentIds: [] }, actorOf(anele));
  const inv8 = await generateInvoice(office, j8.id, { dueDate: addDays(today, 10), includeMaterialVariance: true, send: true }, actorOf(office));
  await recordManualPayment(office, inv8.id, { amount: Math.round(inv8.amountDue * 0.5 * 100) / 100, method: 'EFT', reference: 'ABSA-DEP-44120', paidOn: today }, actorOf(office));

  // Workforce: close open shifts created by QR arrivals, add confirmed history for payroll demo, leave.
  await db().query(`UPDATE timesheets SET clock_out = clock_in + interval '6 hours', total_hours = 6, status = 'CONFIRMED' WHERE clock_out IS NULL AND employee_id <> $1`, [anele.employeeId]);
  for (const [emp, days] of [[sipho, [3, 4, 5, 8, 9]], [anele, [3, 5, 8, 9, 10]], [ruan, [2, 4, 5, 9, 11]]] as const) {
    for (const d of days) {
      const date = addDays(today, -d);
      const start = new Date(businessDayStart(date).getTime() + 7 * 3_600_000);
      await db().query(
        `INSERT INTO timesheets (employee_id, work_date, clock_in, clock_out, total_hours, status, notes, reviewed_by, reviewed_at)
         VALUES ($1,$2,$3,$4,8.5,'CONFIRMED','Seeded shift',$5, now())`,
        [emp.employeeId, date, start, new Date(start.getTime() + 8.5 * 3_600_000), office.userId],
      );
    }
  }
  await requestLeave(anele, { leaveType: 'ANNUAL', startDate: addDays(today, 14), endDate: addDays(today, 18), reason: 'Family holiday' }, actorOf(anele));
  const ruanLeave = await requestLeave(ruan, { leaveType: 'FAMILY', startDate: addDays(today, 7), endDate: addDays(today, 7), reason: 'Child graduation' }, actorOf(ruan));
  await decideLeave(owner, ruanLeave.id, 'APPROVE', 'Approved — enjoy the day', actorOf(owner));

  // Enquiries and a missed call awaiting review
  const guest: Actor = { ...SYSTEM_ACTOR, role: 'GUEST', ip: '127.0.0.1' };
  await submitEnquiry({ name: 'Kagiso Molefe', email: 'kagiso.molefe@example.com', phone: '+27 82 444 1200', sector: 'Industrial High Voltage Substation', urgency: 'HIGH', message: 'We need a quote to replace an 11kV RMU at our Pinetown plant within the next month.', source: 'CONTACT_FORM', consent: true }, undefined, guest);
  await submitEnquiry({ name: 'Megan Pillay', email: 'megan.pillay@example.com', phone: '+27 71 333 9087', urgency: 'STANDARD', message: 'Requesting a quotation for a 30kW rooftop solar system for our offices.', source: 'QUOTE_TOOL', consent: true, details: { sector: 'Solar & Energy Storage', voltageLevel: 'Low Voltage (400V / 230V Three-Phase)', scope: '30kW grid-tied with 20kWh storage', siteAddress: 'Westville, Durban' } }, undefined, guest);
  await submitEnquiry({ name: 'Johan Steyn', email: 'johan.steyn@example.com', phone: '+27 84 222 7719', urgency: 'EMERGENCY', message: 'Complete power failure at our cold-storage facility. Generator not starting.', source: 'CONTACT_FORM', consent: true }, undefined, guest);
  await logMissedCall(office, { phoneNumber: '+27 72 111 2233', callAt: new Date(Date.now() - 45 * 60_000).toISOString(), durationSeconds: 0, source: 'MANUAL' }, actorOf(office));

  await closePool();
  console.log('\nHYDRA demo data seeded.\n');
  console.log('Demo accounts (development only):');
  for (const u of USERS) console.log(`  ${u.role.padEnd(12)} ${u.email}`);
  console.log('  Employees may also sign in with staff numbers PSG-E-0003 … PSG-E-0005.');
  console.log(cfg.SEED_DEMO_PASSWORD ? '\nPassword: value of SEED_DEMO_PASSWORD' : `\nGenerated password for all demo accounts (shown once): ${password}`);
}

main().catch(async (err: unknown) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
