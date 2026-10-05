/**
 * HYDRA Smart Quote development seed (idempotent, additive — never deletes or resets data):
 * version-1 policies, a few owner-approved knowledge entries and, with the development mock provider
 * only, two sample customer cases. Run on its own with `npm run db:seed:ai` (after `npm run db:migrate`).
 */
import type { KnowledgeEntryInput } from '@hydra/shared';
import { config } from '../src/config/env';
import { db } from '../src/db/pool';
import { PostgresKnowledgeRepository } from '../src/repositories/aiKnowledgeRepository';
import { PostgresUserRepository } from '../src/repositories/userRepository';
import { ensureDefaultPolicies } from '../src/services/ai/config';
import { startConversation } from '../src/services/aiAssistantService';
import type { AuthContext } from '../src/types/express';

const KNOWLEDGE: KnowledgeEntryInput[] = [
  {
    title: 'DB trips when the geyser switches on',
    serviceCategory: 'FAULT_FINDING',
    problemSummary: 'Main or geyser circuit breaker / earth leakage trips when the geyser element or thermostat calls for heat.',
    symptoms: ['trips when geyser turns on', 'earth leakage trips at night', 'no hot water after tripping'],
    severity: 3,
    pricingContext: 'Typically 1–2 hours of fault finding; a replacement element or thermostat may be needed after testing.',
    recommendedResponse: 'Book electrical fault finding on the geyser circuit. A technician will test the element, thermostat, isolator and protection. Until then, leave the tripped circuit off and do not repeatedly reset it.',
    clarifyingQuestions: ['Does the main breaker trip, or only the geyser circuit?', 'Is there any burning smell, heat or visible damage?'],
    keywords: ['geyser', 'trip', 'earth leakage', 'element', 'thermostat'],
  },
  {
    title: 'Inverter overload / bypass alarm',
    serviceCategory: 'INVERTER',
    problemSummary: 'Hybrid inverter beeps, shows an overload or bypass fault and drops the essential load.',
    symptoms: ['inverter beeping', 'overload fault code', 'essential load goes off'],
    severity: 3,
    pricingContext: 'Diagnostic call-out plus 1.5–3 hours; firmware or settings review often resolves it without parts.',
    recommendedResponse: 'Book an inverter diagnostic. Our solar technician will review the fault log, load profile and settings. Please send a photo of the error screen.',
    clarifyingQuestions: ['What brand and size is the inverter?', 'Which appliances were running when it alarmed?'],
    keywords: ['inverter', 'overload', 'bypass', 'beeping', 'fault code'],
  },
  {
    title: 'Certificate of Compliance for property transfer',
    serviceCategory: 'COC_INSPECTION',
    problemSummary: 'Seller needs an electrical Certificate of Compliance (CoC) before transfer of a residential property.',
    symptoms: ['selling house', 'transfer attorney asked for CoC'],
    severity: 1,
    pricingContext: 'Price depends on the number of DB boards and any remedial work found during the inspection.',
    recommendedResponse: 'Book a CoC inspection. A registered inspector tests the installation; remedial work, if any, is quoted separately before the certificate is issued.',
    clarifyingQuestions: ['How many distribution boards does the property have?'],
    keywords: ['coc', 'compliance', 'certificate', 'transfer', 'selling'],
  },
];

export async function seedSmartQuote(): Promise<void> {
  await ensureDefaultPolicies();
  const users = new PostgresUserRepository(db());
  const ownerRow = (await db().query<{ id: string }>(`SELECT id FROM users WHERE role = 'ADMIN_OWNER' AND status = 'ACTIVE' ORDER BY created_at LIMIT 1`)).rows[0];
  const { rows: existing } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM ai_knowledge_entries');
  if (ownerRow && existing[0]!.n === 0) {
    const repo = new PostgresKnowledgeRepository(db());
    for (const k of KNOWLEDGE) await repo.create({ ...k, sourceAssessmentId: null, createdBy: ownerRow.id, approve: true });
    console.log(`Smart Quote: ${KNOWLEDGE.length} approved knowledge entries added.`);
  }

  // Sample cases only with the development simulation — never call a paid provider from a seed.
  if (config().aiProvider !== 'mock') return;
  const customer = await users.findByEmail('customer@hydra.demo');
  if (!customer?.customerId) return;
  const { rows: cases } = await db().query<{ n: number }>('SELECT count(*)::int AS n FROM ai_conversations WHERE customer_id = $1', [customer.customerId]);
  if (cases[0]!.n > 0) return;
  const auth: AuthContext = { userId: customer.id, role: 'CUSTOMER', customerId: customer.customerId, employeeId: null, adminId: null, sessionId: 'seed' };
  const actor = { userId: customer.id, role: 'CUSTOMER', requestId: 'seed', ip: '127.0.0.1', auth };
  await startConversation(auth, { message: 'My DB trips whenever I turn my geyser on.', attachmentIds: [], propertyType: 'RESIDENTIAL', siteArea: 'Umhlanga' }, actor);
  await startConversation(auth, { message: 'There is smoke and a burning smell coming from the distribution board in the garage.', attachmentIds: [], propertyType: 'RESIDENTIAL', urgency: 'EMERGENCY' }, actor);
  console.log('Smart Quote: 2 sample cases created for customer@hydra.demo (development simulation).');
}
