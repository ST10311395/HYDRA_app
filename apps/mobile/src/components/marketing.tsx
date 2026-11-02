/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PartnerDto, PortfolioItemDto, ServiceTypeDto, TeamMemberDto } from '@hydra/shared';
import { usePublicContent } from '../api/queries';
import { Badge, Button, Card, HIT, Icon, Label, Text, colors, radius, spacing, type IconName } from '../design-system';
import { SERVICE_CATEGORY_LABEL as CATEGORY_LABEL, SERVICE_ICON, initials, monthYear } from '../utils/format';
import { imageFor } from './images';
import { PSG_CONTACT, PSG_FACTS } from '../content/company';
import { CLIENTS, PROCESS, QUALITY, SAFETY_NOTE, SECTORS, SERVICES } from '../content/marketing';
import { callNumber } from '../utils/links';

/**
 * Seeded / illustrative records (`isDemo`) are never presented to the public as real PSG work, people
 * or partners (Part 3 brief §2). Owner-approved records added through the API are shown.
 */
export function published<T extends { isDemo: boolean }>(items: T[] | undefined): T[] {
  return (items ?? []).filter((i) => !i.isDemo);
}

export function TagPill({ label, icon, tone = 'primary' }: { label: string; icon?: IconName; tone?: 'primary' | 'secondary' }) {
  return <Badge label={label} icon={icon} tone={tone} />;
}

/** Image with bottom fade into the card colour (wireframe photo treatment). */
export function PhotoHeader({ imageKey, height = 170, children, fallback }: { imageKey?: string | null; height?: number; children?: ReactNode; fallback?: Parameters<typeof imageFor>[1] }) {
  return (
    <View style={{ height, overflow: 'hidden', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
      <Image source={imageFor(imageKey, fallback)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      <LinearGradient colors={['rgba(11,15,22,0.05)', 'rgba(11,15,22,0.25)', 'rgba(21,26,34,0.9)']} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { padding: spacing.md, justifyContent: 'space-between' }]}>{children}</View>
    </View>
  );
}

/** Full service card (Our Services page). */
export function ServiceCard({ service, onQuote }: { service: ServiceTypeDto; onQuote: () => void }) {
  return (
    <Card padded={false} testID={`service-${service.slug}`}>
      <PhotoHeader imageKey={service.imageKey} height={150}>
        <View style={styles.rowBetween}>
          <Badge label={CATEGORY_LABEL[service.category] ?? service.category} tone="neutral" solid mono={false} />
          {service.badge ? <Badge label={service.badge} tone="primary" solid mono={false} /> : null}
        </View>
        {service.slaText ? <Badge label={service.slaText} icon="clock" tone="neutral" solid mono={false} /> : null}
      </PhotoHeader>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text variant="h1" style={{ fontSize: 23, lineHeight: 29 }}>{service.name}</Text>
        <Text variant="body" color="textMuted" numberOfLines={3}>{service.description}</Text>
        <View style={styles.specGrid}>
          {service.specs.map((s) => (
            <View key={s.label} style={styles.spec}>
              <Label style={{ fontSize: 10 }}>{s.label}</Label>
              <Text variant="title" weight="bold">{s.value}</Text>
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/service/${service.id}`)} style={[styles.rowBetween, { minHeight: 36 }]}>
          <Text variant="title" color="primaryBright">What’s included</Text>
          <Icon name="chevron-down" size={18} color="primaryBright" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Request Quote" iconRight="arrow-right" onPress={onQuote} style={{ flex: 1 }} />
          <Button label="Details" variant="outline" fullWidth={false} onPress={() => router.push(`/service/${service.id}`)} />
        </View>
      </View>
    </Card>
  );
}

/** Compact carousel card (Home “Core Services”). */
export function ServiceMiniCard({ service, width }: { service: ServiceTypeDto; width: number }) {
  const violet = service.category === 'SOLAR';
  return (
    <Card padded={false} style={{ width }} onPress={() => router.push(`/service/${service.id}`)} accessibilityLabel={service.name}>
      <PhotoHeader imageKey={service.imageKey} height={120}>
        <Badge label={service.badge ?? CATEGORY_LABEL[service.category] ?? ''} tone={violet ? 'secondary' : 'neutral'} solid={!violet} mono={false} />
      </PhotoHeader>
      <View style={{ padding: spacing.md, gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name={SERVICE_ICON[service.category] ?? 'zap'} size={15} color={violet ? 'secondaryBright' : 'primaryBright'} />
          <Text variant="title" weight="bold" numberOfLines={2} style={{ flex: 1 }}>{service.name}</Text>
        </View>
        <Text variant="bodySmall" color="textMuted" numberOfLines={2}>{service.description}</Text>
        <View style={[styles.rowBetween, { marginTop: 6 }]}>
          <Text variant="bodySmall" color={violet ? 'secondaryBright' : 'primaryBright'} weight="semibold">View service</Text>
          <Icon name="arrow-right" size={15} color={violet ? 'secondaryBright' : 'primaryBright'} />
        </View>
      </View>
    </Card>
  );
}

const PROJECT_ICON: Record<string, IconName> = { INDUSTRIAL: 'bar-chart-2', COMMERCIAL: 'grid', SOLAR: 'sun', DATA_FIBRE: 'server' };
const PROJECT_LABEL: Record<string, string> = { INDUSTRIAL: 'INDUSTRIAL', COMMERCIAL: 'COMMERCIAL', SOLAR: 'SOLAR', DATA_FIBRE: 'DATA & FIBER' };

/** Case-study card (Recent Work page). */
export function ProjectCard({ project }: { project: PortfolioItemDto }) {
  const extra = project.highlights.length - 3;
  return (
    <Card padded={false}>
      <PhotoHeader imageKey={project.imageKey} height={210} fallback="project-switchgear">
        <View style={styles.rowBetween}>
          <Badge label={PROJECT_LABEL[project.category] ?? project.category} icon={PROJECT_ICON[project.category]} tone="neutral" solid />
          {project.specBadge ? <Badge label={project.specBadge} tone="primary" solid /> : null}
        </View>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 1 }}>
            <Icon name="map-pin" size={14} color="primaryBright" />
            <Text variant="title" weight="bold" style={{ flexShrink: 1 }}>{project.location}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            <Icon name="calendar" size={13} color="textSecondary" />
            <Text variant="mono" color="textSecondary" style={{ fontSize: 12 }}>{monthYear(project.completedDate)}</Text>
          </View>
        </View>
      </PhotoHeader>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <Text variant="h2">{project.title}</Text>
          <Text variant="bodySmall" color="textMuted">Client: <Text variant="bodySmall" weight="bold">{project.clientName}</Text></Text>
        </View>
        <Text variant="body" color="textMuted" numberOfLines={2}>{project.description}</Text>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: spacing.md, gap: 6 }}>
          <Label>Technical Highlights</Label>
          {project.highlights.slice(0, 3).map((h, i) => (
            <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.hl, { flexShrink: 1 }]}><Text variant="mono" style={{ fontSize: 12 }}>✓ {h}</Text></View>
              {i === 2 && extra > 0 ? <View style={styles.more}><Text variant="mono" color="textMuted" style={{ fontSize: 11 }}>+{extra} more</Text></View> : null}
            </View>
          ))}
        </View>
        <View style={[styles.rowBetween, { flexWrap: 'wrap', rowGap: spacing.sm }]}>
          {project.accreditation ? <Badge label={project.accreditation} icon="shield" tone="secondary" mono={false} /> : <View />}
          <Button label="View Case Study" iconRight="chevron-right" size="sm" fullWidth={false} style={{ alignSelf: 'auto', marginLeft: 'auto' }} onPress={() => router.push(`/project/${project.id}`)} />
        </View>
      </View>
    </Card>
  );
}

/** Home “Recent projects” card. */
export function ProjectMiniCard({ project }: { project: PortfolioItemDto }) {
  return (
    <Card padded={false} onPress={() => router.push(`/project/${project.id}`)} accessibilityLabel={project.title}>
      <PhotoHeader imageKey={project.imageKey} height={150} fallback="project-switchgear">
        <Badge label={project.category === 'INDUSTRIAL' ? 'INDUSTRIAL MANUFACTURING' : project.category === 'COMMERCIAL' ? 'COMMERCIAL REAL ESTATE' : PROJECT_LABEL[project.category] ?? ''} tone={project.category === 'COMMERCIAL' ? 'secondary' : 'primary'} solid={false} />
      </PhotoHeader>
      <View style={[styles.rowBetween, { padding: spacing.lg, alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title" weight="bold">{project.title}</Text>
          <Text variant="bodySmall" color="textMuted">{project.clientName} · {project.location}</Text>
        </View>
        <Badge label="COMPLETED" tone="neutral" />
      </View>
    </Card>
  );
}

export function TestimonialCard() {
  const content = usePublicContent();
  const t = content.data?.testimonial;
  // Only a real, owner-approved testimonial is shown; seeded demo content never is.
  if (!t || content.data?.isDemoContent !== false) return null;
  return (
    <Card>
      <View style={[styles.rowBetween, { marginBottom: spacing.md }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="users" size={18} color="primaryBright" />
          <Text variant="title" weight="bold">CLIENT TESTIMONIALS</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={`Rated ${t.rating} out of 5`}>
          {Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={14} color="secondaryBright" />)}
          <Text variant="title" weight="bold" style={{ marginLeft: 4 }}>{t.rating.toFixed(1)}</Text>
        </View>
      </View>
      <Text variant="body" color="textSecondary" style={{ fontStyle: 'italic' }}>“{t.quote}”</Text>
      <View style={[styles.rowBetween, { marginTop: spacing.lg }]}>
        <View>
          <Text variant="title" weight="bold">{t.author}</Text>
          <Text variant="caption" color="textMuted">{t.role}</Text>
        </View>
        <Badge label="Client" tone="primary" mono={false} />
      </View>
    </Card>
  );
}

/** Closing quotation CTA block used across marketing pages. */
/**
 * Fault reporting call-to-action (replaces the former 24/7 emergency panel, Part 3 brief §6): routes to
 * the existing fault request flow or the verified business line, with neutral safety guidance and no
 * availability or response-time promise.
 */
export function FaultCta({ title = 'Electrical fault?', body = 'Report it with as much detail as you can and we will contact you to arrange diagnosis and repair.' }: { title?: string; body?: string }) {
  return (
    <Card accent="danger" style={{ gap: spacing.md, backgroundColor: '#1E1418' }} testID="fault-cta">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="alert-triangle" size={20} color="dangerBright" />
        <Text variant="h3" style={{ flex: 1 }}>{title}</Text>
      </View>
      <Text variant="bodySmall" color="textSecondary">{body}</Text>
      <Text variant="caption" color="textMuted">{SAFETY_NOTE}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Report a fault" icon="alert-triangle" variant="dangerOutline" size="sm" style={{ flex: 1.2 }} onPress={() => router.navigate({ pathname: '/quote', params: { sector: 'EMERGENCY' } })} />
        <Button label="Call PSG" icon="phone-call" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void callNumber(PSG_CONTACT.primaryPhone)} />
      </View>
      <Text variant="caption" color="textMuted">Office hours {PSG_CONTACT.hoursShort}</Text>
    </Card>
  );
}

/**
 * The six services published on the PSG website. Shown when the live service catalogue is empty or
 * cannot be loaded, so guests always see what PSG does; each row opens the Services tab.
 */
export function ServiceOverview() {
  return (
    <Card style={{ gap: spacing.md }} testID="service-overview">
      {SERVICES.map((s) => (
        <Pressable key={s.title} accessibilityRole="link" accessibilityLabel={s.title} onPress={() => router.navigate('/services')} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={styles.sectorIcon}><Icon name={s.icon} size={16} color="primaryBright" /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title" weight="bold">{s.title}</Text>
            <Text variant="bodySmall" color="textMuted">{s.body}</Text>
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

/** Portfolio clients with their logos and the work done (owner-approved, from the company portfolio). */
export function ClientList() {
  return (
    <Card style={{ gap: spacing.md }} testID="client-list">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="briefcase" size={18} color="primaryBright" />
        <Text variant="h3">Clients we’ve worked with</Text>
      </View>
      {CLIENTS.map((c) => (
        <View key={c.name} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }} accessible accessibilityLabel={`${c.name}. ${c.body}`}>
          <Image source={c.logo} style={styles.clientLogo} contentFit="cover" accessibilityIgnoresInvertColors />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title" weight="bold">{c.name}</Text>
            <Text variant="bodySmall" color="textMuted">{c.body}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Compact row of client logos for the home page; opens the Work tab. */
export function ClientStrip() {
  return (
    <Card onPress={() => router.navigate('/work')} accessibilityLabel={`Clients include ${CLIENTS.map((c) => c.name).join(', ')}. View our work`} style={{ gap: spacing.sm }} testID="client-strip">
      <View style={styles.rowBetween}>
        <Label>Clients include</Label>
        <Icon name="chevron-right" size={16} color="textMuted" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {CLIENTS.map((c) => <Image key={c.name} source={c.logo} style={styles.clientLogo} contentFit="cover" accessibilityIgnoresInvertColors />)}
      </View>
    </Card>
  );
}

/** Owner-confirmed experience and workmanship warranty, as two small facts. */
export function TrustFacts() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="trust-facts">
      <Badge label={`${PSG_FACTS.experience} experience`} icon="award" tone="primary" mono={false} />
      <Badge label={PSG_FACTS.warranty} icon="shield" tone="secondary" mono={false} />
    </View>
  );
}

/** Industries served, from the PSG company portfolio. */
export function SectorList() {
  return (
    <Card style={{ gap: spacing.md }} testID="sector-list">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="briefcase" size={18} color="primaryBright" />
        <Text variant="h3">Industries we serve</Text>
      </View>
      {SECTORS.map((s) => (
        <View key={s.title} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={styles.sectorIcon}><Icon name={s.icon} size={16} color="primaryBright" /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title" weight="bold">{s.title}</Text>
            <Text variant="bodySmall" color="textMuted">{s.body}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** How a job runs, in four plain steps (PSG website). */
export function ProcessSteps() {
  return (
    <Card style={{ gap: spacing.md }} testID="process-steps">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="list" size={18} color="primaryBright" />
        <Text variant="h3">How it works</Text>
      </View>
      {PROCESS.map((p, i) => (
        <View key={p.title} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={styles.step}><Text variant="caption" weight="bold" color="white">{i + 1}</Text></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title" weight="bold">{p.title}</Text>
            <Text variant="bodySmall" color="textMuted">{p.body}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Quality & compliance statement from the PSG company portfolio. No certification claims. */
export function QualityCard() {
  return (
    <Card style={{ gap: spacing.md }} testID="quality-card">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="shield" size={18} color="secondaryBright" />
        <Text variant="h3">Quality & compliance</Text>
      </View>
      <Text variant="bodySmall" color="textMuted">All work carried out by PSG Electrical & Cables adheres to:</Text>
      {QUALITY.standards.map((s) => (
        <View key={s} style={{ flexDirection: 'row', gap: 10 }}>
          <Icon name="check-circle" size={16} color="primaryBright" />
          <Text variant="bodySmall" style={{ flex: 1 }}>{s}</Text>
        </View>
      ))}
      <Text variant="caption" color="textMuted">We prioritise {QUALITY.priorities.join(', ').toLowerCase()}.</Text>
    </Card>
  );
}

const ABOUT_LINKS = [
  { label: 'Why PSG', route: '/why-psg' },
  { label: 'Our team', route: '/team' },
  { label: 'Partners', route: '/partners' },
  { label: 'FAQ', route: '/faq' },
] as const;

/** Site footer: hours, main line, About links and the privacy notice. */
export function MarketingFooter() {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }} testID="marketing-footer">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: spacing.lg, rowGap: spacing.xs, marginBottom: spacing.sm }} accessibilityRole="menu">
        {ABOUT_LINKS.map((l) => (
          <Pressable key={l.route} accessibilityRole="link" onPress={() => router.push(l.route)} style={{ minHeight: HIT, justifyContent: 'center' }}>
            <Text variant="bodySmall" color="primaryBright" weight="semibold">{l.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Icon name="clock" size={14} color="primaryBright" />
        <Text variant="bodySmall" color="textSecondary">{PSG_CONTACT.hoursShort}</Text>
        <Text variant="bodySmall" color="textMuted">·</Text>
        <Icon name="phone" size={14} color="secondaryBright" />
        <Text variant="bodySmall" color="textSecondary">{PSG_CONTACT.primaryPhone}</Text>
      </View>
      <Text variant="mono" color="textMuted" align="center" style={{ fontSize: 11 }}>© {new Date().getFullYear()} PSG Electrical & Cables. All rights reserved.</Text>
      <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} hitSlop={8}>
        <Text variant="caption" color="primaryBright">Privacy notice (POPIA)</Text>
      </Pressable>
    </View>
  );
}

export function PartnerCard({ partner }: { partner: PartnerDto }) {
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <View style={styles.monogram}><Text variant="h3" color="background">{initials(partner.name)}</Text></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3">{partner.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={styles.catPill}><Text variant="caption" weight="bold">{partner.categoryLabel}</Text></View>
            {partner.establishedYear ? <Text variant="mono" color="textMuted" style={{ fontSize: 12 }}>Est. {partner.establishedYear}</Text> : null}
          </View>
        </View>
        <Icon name="chevron-right" size={18} color="textMuted" />
      </View>
      <Text variant="bodySmall" color="textMuted">{partner.description}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: spacing.md }}>
        {partner.tags.map((t) => <View key={t} style={styles.hl}><Text variant="mono" style={{ fontSize: 11 }}>{t}</Text></View>)}
      </View>
      <View style={[styles.rowBetween, { flexWrap: 'wrap', gap: 6 }]}>
        {partner.certification ? <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', flexShrink: 1 }}><Icon name="check-circle" size={14} color="primaryBright" /><Text variant="caption" weight="semibold" style={{ flexShrink: 1 }}>{partner.certification}</Text></View> : null}
        {partner.guarantee ? <Text variant="mono" color="secondaryBright" style={{ fontSize: 11 }}>{partner.guarantee}</Text> : null}
      </View>
    </Card>
  );
}

const AVAIL: Record<TeamMemberDto['availability'], { label: string; tone: 'primary' | 'secondary' | 'neutral' }> = {
  AVAILABLE: { label: 'Available', tone: 'primary' },
  ON_SITE: { label: 'On Site', tone: 'secondary' },
  IN_DISPATCH: { label: 'In Dispatch', tone: 'neutral' },
};

export function TeamCard({ member, onCall, onCredentials }: { member: TeamMemberDto; onCall: () => void; onCredentials: () => void }) {
  const a = AVAIL[member.availability];
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View>
          <Image source={imageFor(member.photoKey)} style={styles.avatar} contentFit="cover" accessibilityLabel={`Photo of ${member.name}`} />
          <View style={styles.availPill}><Badge label={`• ${a.label}`} tone={a.tone} mono={false} /></View>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.rowBetween}>
            <Text variant="h2" style={{ flex: 1, fontSize: 19 }}>{member.name}</Text>
            {member.rating ? (
              <View style={styles.rating}><Icon name="star" size={13} color="secondaryBright" /><Text variant="title" weight="bold">{member.rating.toFixed(1)}</Text></View>
            ) : null}
          </View>
          <Text variant="bodySmall" color="primaryBright">{member.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {member.registration ? <View style={styles.hl}><Text variant="mono" color="textMuted" style={{ fontSize: 11 }}>{member.registration}</Text></View> : null}
            {member.licence ? <View style={[styles.hl, { borderColor: colors.primaryBorder }]}><Text variant="mono" color="primaryBright" style={{ fontSize: 11 }}>{member.licence}</Text></View> : null}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {member.skills.slice(0, 3).map((s) => <View key={s} style={styles.skill}><Text variant="caption" weight="semibold">{s}</Text></View>)}
        {member.skills.length > 3 ? <View style={styles.skill}><Text variant="caption" color="textMuted">+{member.skills.length - 3}</Text></View> : null}
      </View>
      <View style={styles.expRow}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="briefcase" size={15} color="primaryBright" /><Text variant="title" weight="bold">{member.experienceYears} yrs</Text><Text variant="bodySmall" color="textMuted">experience</Text></View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="check-circle" size={15} color="secondaryBright" /><Text variant="title" weight="bold">{member.projectsCount}+</Text><Text variant="bodySmall" color="textMuted">projects</Text></View>
      </View>
      {member.leadProject ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name="zap" size={14} color="primaryBright" />
          <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}><Text variant="bodySmall" weight="bold">Lead: </Text>{member.leadProject}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="View Credentials" icon="file-text" variant="secondary" size="sm" style={{ flex: 1 }} onPress={onCredentials} />
        <Button label="Call" icon="phone-call" variant="secondary" size="sm" fullWidth={false} onPress={onCall} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  clientLogo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white },
  sectorIcon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  step: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spec: { width: '48.5%', backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 4 },
  hl: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 240 },
  more: { borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, paddingHorizontal: 6, paddingVertical: 3 },
  monogram: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  catPill: { backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  avatar: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  availPill: { position: 'absolute', bottom: -10, left: -4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  skill: { backgroundColor: colors.surfaceElevated, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surfaceInset, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
});
