/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { Queryable } from '../src/db/pool';
import { PostgresSettingsRepository } from '../src/repositories/settingsRepository';
import { DEPARTMENTS, FAQS, OFFICES, PUBLIC_CONTENT, SERVICE_TYPES } from './content';

/**
 * Part 3 public-content refresh for a database seeded before Part 3. Updates public marketing content
 * only: service wording by slug (ids, categories and prices untouched), company content, offices,
 * department desks and FAQs. Jobs, quotes, invoices, users and all other records are untouched.
 * Run inside a transaction (see scripts/refresh-public-content.ts).
 */
export async function refreshPublicContent(q: Queryable): Promise<{ servicesUpdated: number }> {
  let servicesUpdated = 0;
  for (const s of SERVICE_TYPES) {
    const r = await q.query(
      'UPDATE service_types SET name = $2, description = $3, sla_text = $4, badge = $5, specs = $6, features = $7 WHERE slug = $1',
      [s.slug, s.name, s.description, s.slaText, s.badge, JSON.stringify(s.specs), JSON.stringify(s.features)],
    );
    servicesUpdated += r.rowCount ?? 0;
  }
  await new PostgresSettingsRepository(q).setJson('publicContent', PUBLIC_CONTENT, null);
  await q.query('DELETE FROM offices');
  for (const [i, o] of OFFICES.entries()) {
    await q.query(
      'INSERT INTO offices (region, name, area, address, phone, email, manager, hours, latitude, longitude, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [o.region, o.name, o.area, o.address, o.phone, o.email, o.manager, o.hours, o.lat, o.lng, i],
    );
  }
  await q.query('DELETE FROM department_contacts');
  for (const [i, d] of DEPARTMENTS.entries()) {
    await q.query('INSERT INTO department_contacts (name, email, phone, sla, icon, display_order) VALUES ($1,$2,$3,$4,$5,$6)', [d.name, d.email, d.phone, d.sla, d.icon, i]);
  }
  await q.query('DELETE FROM faqs');
  const order: Record<string, number> = {};
  for (const f of FAQS) {
    order[f.category] = (order[f.category] ?? 0) + 1;
    await q.query('INSERT INTO faqs (question, answer, category, display_order) VALUES ($1,$2,$3,$4)', [f.q, f.a, f.category, order[f.category]]);
  }
  return { servicesUpdated };
}
