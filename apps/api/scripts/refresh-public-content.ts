/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Part 3 content refresh for an EXISTING database. The demo seed only inserts into an empty database,
 * so databases created before Part 3 still hold the old marketing copy (24/7 promises, invented
 * offices and FAQs). See seeds/content-refresh.ts for exactly what changes. Demo portfolio, team and
 * partner rows stay in place; the app no longer shows `is_demo` rows publicly.
 *
 * Dry run (default):  npm run db:content:refresh -w @hydra/api
 * Apply:              npm run db:content:refresh -w @hydra/api -- --apply
 * Production also needs --allow-production, and should only be run with the owner's approval.
 */
import { config } from '../src/config/env';
import { closePool, db, withTransaction } from '../src/db/pool';
import { DEPARTMENTS, FAQS, OFFICES, SERVICE_TYPES } from '../seeds/content';
import { refreshPublicContent } from '../seeds/content-refresh';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (config().isProduction && apply && !process.argv.includes('--allow-production')) {
    throw new Error('Refusing to change production content without --allow-production (owner approval required).');
  }
  const count = async (table: string) => (await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n ?? 0;
  const slugs = SERVICE_TYPES.map((s) => s.slug);
  const matched = (await db().query<{ slug: string }>('SELECT slug FROM service_types WHERE slug = ANY($1)', [slugs])).rows.map((r) => r.slug);

  console.log(`Service types to reword: ${matched.length} of ${slugs.length} (${matched.join(', ') || 'none'})`);
  console.log('Company content: replace with verified PSG contact details');
  console.log(`Offices: ${await count('offices')} → ${OFFICES.length}; department desks: ${await count('department_contacts')} → ${DEPARTMENTS.length}; FAQs: ${await count('faqs')} → ${FAQS.length}`);
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to make these changes.');
    return;
  }
  const result = await withTransaction((tx) => refreshPublicContent(tx));
  console.log(`\nPublic content refreshed (${result.servicesUpdated} service types reworded).`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void closePool());
