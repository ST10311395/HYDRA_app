/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { ServiceCategory } from '@hydra/shared';
import type { IconName } from '../design-system';

/**
 * What the customer needs, using the PSG website's quick-intake categories (Part 3, client screenshot
 * IMG-20261021-WA0012: no Fiber & Data Cabling sector, no HVAC wording). Each maps to a stored service
 * category so the matching services are offered first.
 */
export type SectorKey = 'INSTALL' | 'FAULT' | 'DB' | 'COC' | 'SOLAR' | 'MAINTENANCE';
export type SiteType = '' | 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL';

export const SECTORS: { key: SectorKey; title: string; sub: string; icon: IconName; category: ServiceCategory }[] = [
  { key: 'INSTALL', title: 'New installation', sub: 'Residential, commercial or industrial installations, fit-outs and cabling', icon: 'git-merge', category: 'CABLING' },
  { key: 'FAULT', title: 'Fault or repair', sub: 'Tripping, power loss, burning smells or damaged equipment', icon: 'alert-triangle', category: 'EMERGENCY' },
  { key: 'DB', title: 'DB board', sub: 'New distribution boards, upgrades and replacements', icon: 'grid', category: 'SUBSTATIONS' },
  { key: 'COC', title: 'Compliance (CoC)', sub: 'Inspection and testing, Certificates of Compliance and hazardous areas', icon: 'shield', category: 'COMPLIANCE' },
  { key: 'SOLAR', title: 'Solar & backup', sub: 'Panels, inverters and battery backup (Trite Solar)', icon: 'sun', category: 'SOLAR' },
  { key: 'MAINTENANCE', title: 'Maintenance', sub: 'Preventative and scheduled maintenance and upgrades', icon: 'tool', category: 'AUTOMATION' },
];

export const SITE_TYPES = [
  { value: 'RESIDENTIAL', label: 'Residential — homes and complexes' },
  { value: 'COMMERCIAL', label: 'Commercial — offices, retail and multi-site premises' },
  { value: 'INDUSTRIAL', label: 'Industrial — plants, warehouses and hazardous areas' },
] as const;
export const SITE_LABEL: Record<Exclude<SiteType, ''>, string> = { RESIDENTIAL: 'Residential', COMMERCIAL: 'Commercial', INDUSTRIAL: 'Industrial' };

/**
 * Sector keys used before Part 3 (deep links from the estimator, “Report a fault”, and drafts saved on
 * devices) map onto the new categories so nothing breaks; Fiber & Data Cabling becomes an installation.
 */
const LEGACY_SECTOR: Record<string, { sector: SectorKey; site?: Exclude<SiteType, ''> }> = {
  INDUSTRIAL: { sector: 'INSTALL', site: 'INDUSTRIAL' },
  COMMERCIAL: { sector: 'INSTALL', site: 'COMMERCIAL' },
  FIBRE: { sector: 'INSTALL' },
  AUDIT: { sector: 'COC' },
  EMERGENCY: { sector: 'FAULT' },
};

/** Resolves a current or legacy sector key; unknown values fall back to a new installation. */
export function resolveSector(key: string | undefined): { sector: SectorKey; site?: Exclude<SiteType, ''> } | null {
  if (!key) return null;
  if (SECTORS.some((s) => s.key === key)) return { sector: key as SectorKey };
  return LEGACY_SECTOR[key] ?? null;
}
