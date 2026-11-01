/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { IconName } from '../design-system';

/**
 * Approved public copy for PSG Electrical & Cables (Part 3 client brief §2). Sources: the PSG
 * website (services, process, hours) and the owner's company portfolio (capabilities, sectors,
 * quality statement). No availability, response-time, certification or accreditation claims —
 * add those only with owner evidence. See docs/PART3_CLIENT_CHANGES.md.
 */

export const TAGLINE = 'Innovation-driven electrical solutions';

/** Hero copy requested by the client (IMG-20261021-WA0010), grounded in the portfolio. */
export const HERO = {
  eyebrow: 'Electrical · Testing · Compliance',
  title: 'Powering what matters.',
  body: 'Hazardous-area electrical testing and inspections, precise fault diagnosis, and dependable electrical maintenance for commercial and industrial facilities. We prioritise safety, compliance and clear recommendations.',
} as const;

/** The six services published on the PSG website, in the website's order. */
export const SERVICES: { title: string; icon: IconName; body: string }[] = [
  { title: 'Electrical installations', icon: 'git-merge', body: 'Residential installations, commercial fit-outs and industrial electrical work, including cable management.' },
  { title: 'Fault finding', icon: 'search', body: 'Electrical fault diagnosis, testing and verification, with clear corrective recommendations.' },
  { title: 'Distribution boards', icon: 'grid', body: 'New installations, upgrades and replacements, inspection and circuit organisation.' },
  { title: 'Compliance (CoC)', icon: 'shield', body: 'Inspections and testing towards compliance with SANS 10142-1, plus documentation.' },
  { title: 'Maintenance & repairs', icon: 'tool', body: 'Preventative and scheduled maintenance, fault repairs and upgrades.' },
  { title: 'Solar & backup power', icon: 'sun', body: 'Panels, inverters and battery backup through our solar division, Trite Solar.' },
];

/** Industries served, from the company portfolio. */
export const SECTORS: { title: string; icon: IconName; body: string }[] = [
  { title: 'Industrial & manufacturing', icon: 'settings', body: 'Electrical solutions supporting production and operational efficiency.' },
  { title: 'Retail & commercial', icon: 'shopping-bag', body: 'Electrical services for multi-site and operational environments.' },
  { title: 'Logistics & warehousing', icon: 'truck', body: 'Infrastructure solutions for distribution and storage facilities.' },
  { title: 'Institutional facilities', icon: 'book-open', body: 'Compliance-driven work within structured environments such as campuses.' },
  { title: 'Chemical & hazardous environments', icon: 'alert-triangle', body: 'Electrical work carried out with strict adherence to safety and operational standards.' },
];

/** How work is delivered, from the PSG website. */
export const PROCESS: { title: string; body: string }[] = [
  { title: 'Tell us what you need', body: 'Request a quote or describe the fault in the app.' },
  { title: 'Assessment & quotation', body: 'An on-site assessment where needed, then a clear quotation.' },
  { title: 'Safe installation', body: 'Work carried out safely, with minimal disruption to operations.' },
  { title: 'Testing & CoC', body: 'Testing, and a Certificate of Compliance where required.' },
];

/** Quality statement, from the company portfolio. */
export const QUALITY = {
  standards: ['SANS 10142 wiring standards', 'Electrical Certificate of Compliance (CoC) requirements', 'Industry best practice'],
  priorities: ['Safety', 'Compliance', 'Long-term system reliability'],
} as const;

/** Neutral safety guidance: PSG is not a public emergency service (brief §6). */
export const SAFETY_NOTE = 'If there is immediate danger to life, fire or smoke, move to safety and contact your local emergency services first.';
