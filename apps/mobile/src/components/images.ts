/**
 * Bundled imagery extracted from the approved high-fidelity wireframes. Database records reference
 * these by `imageKey` / `photoKey`; unknown keys fall back to a neutral technical image.
 */
export const IMAGES = {
  'hero-substation': require('../../assets/images/content/hero-substation.jpg'),
  'project-smelter': require('../../assets/images/content/project-smelter.jpg'),
  'project-campus': require('../../assets/images/content/project-campus.jpg'),
  'project-solar': require('../../assets/images/content/project-solar.jpg'),
  'project-datacenter': require('../../assets/images/content/project-datacenter.jpg'),
  'project-logistics': require('../../assets/images/content/project-logistics.jpg'),
  'project-switchgear': require('../../assets/images/content/project-switchgear.jpg'),
  'project-office': require('../../assets/images/content/project-office.jpg'),
  'service-solar': require('../../assets/images/content/service-solar.jpg'),
  'service-cabling': require('../../assets/images/content/service-cabling.jpg'),
  'service-substation': require('../../assets/images/content/service-substation.jpg'),
  'service-emergency': require('../../assets/images/content/service-emergency.jpg'),
  'service-coc': require('../../assets/images/content/service-coc.jpg'),
  'service-automation': require('../../assets/images/content/service-automation.jpg'),
  'quote-blueprint': require('../../assets/images/content/quote-blueprint.jpg'),
  'contact-hq': require('../../assets/images/content/contact-hq.jpg'),
  'compliance-certificate': require('../../assets/images/content/compliance-certificate.jpg'),
  'pillar-iso': require('../../assets/images/content/pillar-iso.jpg'),
  'pillar-years': require('../../assets/images/content/pillar-years.jpg'),
  'pillar-clock': require('../../assets/images/content/pillar-clock.jpg'),
  'team-david': require('../../assets/images/content/team-david.jpg'),
  'team-sarah': require('../../assets/images/content/team-sarah.jpg'),
  'team-johan': require('../../assets/images/content/team-johan.jpg'),
  'team-sibusiso': require('../../assets/images/content/team-sibusiso.jpg'),
  'team-elena': require('../../assets/images/content/team-elena.jpg'),
} as const;

export type ImageKey = keyof typeof IMAGES;

export function imageFor(key: string | null | undefined, fallback: ImageKey = 'hero-substation') {
  return (key && key in IMAGES ? IMAGES[key as ImageKey] : IMAGES[fallback]) as number;
}
