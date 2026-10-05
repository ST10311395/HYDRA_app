/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import type { AiSettings, PricingPolicy, SafetyRule, SeverityPolicy } from '@hydra/shared';

/**
 * Default (version 1) policies for HYDRA Smart Quote. They are written to `ai_policies` the first time
 * the assistant runs (or by the seed) and are then owner-configurable as new immutable versions.
 * Development figures only — PSG Electrical must confirm real rates before production use.
 */

/** Bump when the system prompt / output contract changes; stored on every assessment. */
export const PROMPT_VERSION = 'smartquote-2026-10-04.1';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  featureEnabled: true,
  providerMode: 'ENV_DEFAULT',
  modelName: '',
  maxClarificationRounds: 3,
  proposalConfidenceThreshold: 80,
  reviewConfidenceThreshold: 60,
  escalateSeverityAtOrAbove: 4,
  requireAdminApprovalForAllProposals: false,
  knowledgeRetrievalCount: 3,
  officeAdminCanApproveKnowledge: true,
  pricingTolerancePct: 40,
  maxImagesPerConversation: 8,
  reviewAgeingHours: 4,
};

/**
 * Deterministic safety rules that do not depend on the AI noticing a hazard. Code-defined and
 * immutable: the owner can add rules (`additionalSafetyRules`) but cannot remove or weaken these.
 */
export const CORE_SAFETY_RULES: SafetyRule[] = [
  { code: 'ELECTRICAL_FIRE', label: 'Fire or flames', minSeverity: 5, keywords: ['fire', 'flames', 'flame', 'on fire', 'caught fire', 'blaze', 'burst into flames'] },
  { code: 'SMOKE', label: 'Smoke', minSeverity: 5, keywords: ['smoke', 'smoking', 'smoked', 'smouldering', 'smoldering'] },
  { code: 'ELECTRIC_SHOCK', label: 'Electric shock / electrocution', minSeverity: 5, keywords: ['shock', 'shocked', 'shocks', 'electrocuted', 'electrocution', 'got a jolt', 'zapped me', 'got zapped'] },
  { code: 'EXPOSED_LIVE_CONDUCTOR', label: 'Exposed live conductors', minSeverity: 5, keywords: ['exposed wire', 'exposed wires', 'exposed live', 'live wire', 'live wires', 'bare wire', 'bare wires', 'wires hanging', 'wires sticking out', 'exposed conductor', 'exposed cable', 'exposed cables'] },
  { code: 'ARCING', label: 'Arcing', minSeverity: 5, keywords: ['arcing', 'arc flash', 'arcs', 'flashover', 'blue flash', 'explosion', 'exploded', 'bang and flash'] },
  { code: 'FLOODING', label: 'Water / flooding near electrical equipment', minSeverity: 5, keywords: ['flood', 'flooding', 'flooded', 'water in the db', 'water on the db', 'water in the board', 'water inside the', 'water dripping on', 'water leaking into', 'wet db', 'wet distribution board', 'water near the'] },
  { code: 'BATTERY_THERMAL_EVENT', label: 'Battery thermal event', minSeverity: 5, keywords: ['thermal runaway', 'battery smoke', 'battery fire', 'battery hissing', 'battery venting', 'battery is hissing', 'battery exploded'] },
  { code: 'SPARKING', label: 'Sparking', minSeverity: 4, keywords: ['spark', 'sparks', 'sparking', 'sparked'] },
  { code: 'BURNING_SMELL', label: 'Burning smell', minSeverity: 4, keywords: ['burning smell', 'smell of burning', 'smells like burning', 'smells burnt', 'burnt smell', 'burning plastic', 'melting smell', 'smell burning'] },
  { code: 'OVERHEATING', label: 'Severe overheating / melting', minSeverity: 4, keywords: ['overheating', 'overheated', 'very hot', 'too hot to touch', 'hot to touch', 'hot to the touch', 'melted', 'melting', 'scorched', 'scorch marks', 'burn marks', 'black marks', 'charred'] },
  { code: 'BATTERY_DAMAGE', label: 'Damaged / swollen battery', minSeverity: 4, keywords: ['swollen battery', 'battery swollen', 'battery is swollen', 'bulging battery', 'battery bulging', 'battery overheating', 'battery is hot', 'battery leaking', 'leaking battery'] },
];

const L = (
  level: number,
  name: string,
  description: string,
  examples: string[],
  targetResponse: string,
  responseWindow: string,
  customerWording: string,
  escalate: boolean,
  adminApprovalRequired: boolean,
  jobUrgency: 'STANDARD' | 'HIGH' | 'EMERGENCY',
) => ({ level, name, description, examples, targetResponse, responseWindow, customerWording, escalate, adminApprovalRequired, jobUrgency });

export const DEFAULT_SEVERITY_POLICY: SeverityPolicy = {
  levels: [
    L(1, 'Low', 'Minor or non-urgent issue. Normal booking.', ['Cosmetic issue', 'Single non-critical light', 'Routine inspection request', 'Optional upgrade'],
      'Standard booking', '3–5 business days',
      'Standard booking — we normally make contact within 3–5 business days, subject to technician availability.', false, false, 'STANDARD'),
    L(2, 'Moderate', 'Needs attention but currently stable.', ['Intermittent equipment issue', 'Single outlet or circuit issue without danger signs', 'Performance degradation'],
      'Priority booking', '1–3 business days',
      'Priority booking — expected response window of 1–3 business days, subject to technician availability.', false, false, 'STANDARD'),
    L(3, 'High', 'Material operational impact.', ['Repeated breaker tripping', 'Significant loss of power', 'Solar / inverter system failure', 'Multiple affected circuits', 'Business interruption'],
      'Priority response', 'within approximately 24 hours',
      'Priority response — target response within approximately 24 hours, subject to technician availability.', false, false, 'HIGH'),
    L(4, 'Urgent', 'Possible safety risk or major operational impact.', ['Severe overheating', 'Sparking reports', 'Burning smell', 'Damaged electrical equipment', 'Important site without power', 'Serious inverter / battery fault'],
      'Urgent', 'same-day target where available',
      'Urgent — our team has been alerted and will aim for a same-day response where available, subject to technician availability.', true, true, 'EMERGENCY'),
    L(5, 'Critical', 'Potential immediate danger.', ['Electrical fire', 'Exposed live conductors', 'Smoke', 'Serious arcing', 'Electrical shock incident', 'Flooding around electrical equipment', 'Severe battery thermal event'],
      'Emergency escalation', 'immediate contact workflow',
      'Emergency escalation — our team has been alerted immediately. If anyone is in danger, contact emergency services now.', true, true, 'EMERGENCY'),
  ],
  additionalSafetyRules: [],
  businessHours: { timezone: 'Africa/Johannesburg', days: [1, 2, 3, 4, 5], start: '07:00', end: '17:00' },
  outOfHoursNotice:
    'It is currently outside office hours. Our team will review this at the start of the next business day — for anything dangerous, call the 24/7 emergency line.',
};

type Cat = PricingPolicy['categories'][number];
const C = (
  code: string, label: string, serviceTypeSlug: string | null, supported: boolean, keywords: string[], calloutFee: number,
  hours: [number, number], materials: [number, number], priceFloor: number, priceCeiling: number, defaultSeverity: number,
  typicalMaterials: Cat['typicalMaterials'] = [],
): Cat => ({
  code, label, serviceTypeSlug, supported, keywords, calloutFee,
  labourHours: { min: hours[0], max: hours[1] }, materials: { min: materials[0], max: materials[1] },
  typicalMaterials, priceFloor, priceCeiling, defaultSeverity,
});

/** Canonical AI service categories, mapped onto the existing HYDRA service types (no duplicate services). */
export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  labourRatePerHour: 650,
  afterHoursMultiplier: 1.5,
  afterHoursCalloutSurcharge: 650,
  urgencyUpliftPct: [0, 0, 10, 25, 25],
  materialMarkupPct: 20,
  globalMinimum: 450,
  globalMaximum: 2_500_000,
  roundTo: 50,
  includeVat: true,
  categories: [
    C('FAULT_FINDING', 'Electrical fault finding', 'emergency-repairs-diagnostics', true,
      ['trip', 'trips', 'tripping', 'tripped', 'fault', 'no power', 'power out', 'power keeps', 'breaker', 'earth leakage', 'elu', 'short circuit', 'half the house', 'intermittent', 'keeps going off'], 550, [1, 3], [0, 800], 900, 8000, 3,
      [{ sku: 'BRK-MCB-20A', qtyMin: 0, qtyMax: 1 }]),
    C('GEYSER_ELECTRICAL', 'Geyser electrical fault', 'emergency-repairs-diagnostics', true,
      ['geyser', 'element', 'thermostat', 'hot water', 'water heater', 'geyser isolator', 'no hot water'], 550, [1, 3], [200, 1500], 1000, 7000, 3,
      [{ sku: 'BRK-MCB-20A', qtyMin: 0, qtyMax: 1 }]),
    C('DB_BOARD', 'DB board work', 'emergency-repairs-diagnostics', true,
      ['db', 'db board', 'distribution board', 'breaker box', 'main switch', 'board replacement', 'new db', 'db upgrade'], 550, [2, 6], [300, 3500], 1500, 18000, 2,
      [{ sku: 'DB-24W-SURF', qtyMin: 0, qtyMax: 1 }, { sku: 'BRK-MCB-20A', qtyMin: 0, qtyMax: 6 }, { sku: 'BRK-ELU-63A', qtyMin: 0, qtyMax: 1 }]),
    C('COC_INSPECTION', 'Certificate of Compliance (CoC) / inspection', 'coc-audits', true,
      ['coc', 'certificate of compliance', 'compliance', 'inspection', 'selling', 'transfer', 'audit', 'electrical certificate'], 0, [2, 5], [0, 1500], 1500, 9000, 1),
    C('SOCKETS_SWITCHES', 'Plugs, sockets & switches', 'emergency-repairs-diagnostics', true,
      ['plug', 'plugs', 'socket', 'sockets', 'outlet', 'switch', 'plug point', 'wall plug', 'light switch'], 450, [0.5, 2], [80, 600], 550, 4000, 2),
    C('LIGHTING', 'Lighting', 'emergency-repairs-diagnostics', true,
      ['light', 'lights', 'lighting', 'bulb', 'downlight', 'downlights', 'flicker', 'flickering', 'light fitting', 'led'], 450, [1, 3], [100, 1500], 650, 7000, 1),
    C('ELECTRICAL_INSTALLATION', 'Electrical installation', 'industrial-cabling-fibre', true,
      ['install', 'installation', 'new circuit', 'add a plug', 'add socket', 'new plug', 'stove connection', 'aircon', 'air conditioner', 'connect a', 'wiring for'], 450, [2, 8], [300, 4000], 1200, 25000, 1),
    C('CABLING', 'Cabling & reticulation', 'industrial-cabling-fibre', true,
      ['cable', 'cabling', 'trench', 'armoured', 'swa', 'fibre', 'conduit', 'underground cable', 'reticulation'], 650, [3, 16], [800, 15000], 2500, 80000, 2,
      [{ sku: 'CBL-SWA-16-4C', qtyMin: 0, qtyMax: 30 }, { sku: 'CND-PVC-25', qtyMin: 0, qtyMax: 10 }]),
    C('INVERTER', 'Inverter fault / service', 'commercial-solar-micro-grids', true,
      ['inverter', 'error code', 'fault code', 'inverter beeping', 'hybrid inverter', 'grid tie', 'inverter alarm', 'inverter screen'], 750, [1.5, 4], [0, 5000], 1500, 40000, 3),
    C('BATTERY', 'Battery storage', 'commercial-solar-micro-grids', true,
      ['battery', 'batteries', 'lithium', 'lifepo4', 'bms', 'battery bank', 'not charging', 'storage'], 750, [1.5, 4], [0, 3000], 1500, 45000, 3),
    C('SOLAR_MAINTENANCE', 'Solar maintenance', 'commercial-solar-micro-grids', true,
      ['maintenance', 'cleaning', 'panel cleaning', 'annual service', 'check-up', 'checkup', 'service my solar'], 650, [2, 5], [0, 800], 1200, 9000, 1),
    C('SOLAR_UPGRADE', 'Solar system upgrade', 'commercial-solar-micro-grids', true,
      ['upgrade', 'expand', 'more panels', 'add battery', 'bigger inverter', 'extension', 'add panels'], 750, [4, 16], [3000, 60000], 5000, 180000, 1),
    C('SOLAR_PANELS', 'Solar panels / PV', 'commercial-solar-micro-grids', true,
      ['solar', 'panel', 'panels', 'pv', 'photovoltaic', 'solar output', 'low production'], 750, [2, 6], [0, 3000], 1500, 30000, 2),
    C('BACKUP_POWER', 'Backup power / load-shedding solutions', 'commercial-solar-micro-grids', true,
      ['backup', 'back-up', 'load shedding', 'loadshedding', 'ups', 'generator', 'changeover', 'essential load'], 650, [3, 10], [1500, 30000], 3000, 120000, 2),
    C('HV_INDUSTRIAL', 'High-voltage / industrial installation', 'hv-substations-distribution', false,
      ['substation', 'transformer', 'high voltage', 'hv', 'mv', 'medium voltage', 'switchgear', 'kva', 'mini-sub', 'minisub', '11kv'], 1500, [8, 80], [5000, 500000], 10000, 2000000, 3),
    C('OTHER', 'Other / unclassified', null, false, [], 550, [1, 4], [0, 2000], 800, 20000, 2),
  ],
};
