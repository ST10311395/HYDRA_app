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
import { Badge, Button, Card, Icon, Label, Text, colors, radius, spacing, type IconName } from '../design-system';
import { SERVICE_ICON, initials, monthYear } from '../utils/format';
import { imageFor } from './images';
import { callNumber } from '../utils/links';

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

const CATEGORY_LABEL: Record<string, string> = {
  SOLAR: 'SOLAR & RENEWABLES',
  CABLING: 'CABLING & FIBER',
  SUBSTATIONS: 'SUBSTATIONS & HV',
  EMERGENCY: '24/7 MAINTENANCE',
  COMPLIANCE: 'COC & AUDITING',
  AUTOMATION: 'LIGHTING & AUTOMATION',
};

/** Full service card (Our Services page). */
export function ServiceCard({ service, onQuote }: { service: ServiceTypeDto; onQuote: () => void }) {
  return (
    <Card padded={false} testID={`service-${service.slug}`}>
      <PhotoHeader imageKey={service.imageKey} height={150}>
        <View style={styles.rowBetween}>
          <Badge label={CATEGORY_LABEL[service.category] ?? service.category} tone="neutral" solid />
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
          <Text variant="title" color="primaryBright">Technical Scope & Features</Text>
          <Icon name="chevron-down" size={18} color="primaryBright" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Request Quote" iconRight="arrow-right" onPress={onQuote} style={{ flex: 1 }} />
          <Button label="Full Specs" variant="outline" fullWidth={false} onPress={() => router.push(`/service/${service.id}`)} />
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
        <Badge label={service.badge ?? CATEGORY_LABEL[service.category] ?? ''} tone={violet ? 'secondary' : 'neutral'} solid={!violet} />
      </PhotoHeader>
      <View style={{ padding: spacing.md, gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Icon name={SERVICE_ICON[service.category] ?? 'zap'} size={15} color={violet ? 'secondaryBright' : 'primaryBright'} />
          <Text variant="title" weight="bold" numberOfLines={2} style={{ flex: 1 }}>{service.name}</Text>
        </View>
        <Text variant="bodySmall" color="textMuted" numberOfLines={2}>{service.description}</Text>
        <View style={[styles.rowBetween, { marginTop: 6 }]}>
          <Text variant="bodySmall" color={violet ? 'secondaryBright' : 'primaryBright'} weight="semibold">{violet ? 'Solar Calculator' : 'Scope Specifications'}</Text>
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
  if (!t) return null;
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
        <Badge label="VERIFIED CLIENT" tone="primary" />
      </View>
    </Card>
  );
}

/** Closing quotation CTA block used across marketing pages. */
export function QuoteCta({ eyebrow = '// READY TO START YOUR PROJECT?', title = 'GET AN ENGINEER-REVIEWED QUOTATION WITHIN 24 HOURS', body = 'Select your sector, specify your electrical scope, and receive a binding technical proposal.', primary = 'Launch Multi-Step Quote Tool', secondary = 'Contact Engineering Desk' }: { eyebrow?: string; title?: string; body?: string; primary?: string; secondary?: string }) {
  return (
    <Card accent="primary" style={{ gap: spacing.md, backgroundColor: '#121A2B' }}>
      <Label color="primaryBright">{eyebrow}</Label>
      <Text variant="h2" style={{ fontSize: 19 }}>{title}</Text>
      <Text variant="bodySmall" color="textMuted">{body}</Text>
      <Button label={primary} icon="file-text" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
      <Button label={secondary} icon="phone-call" variant="secondary" onPress={() => router.navigate('/contact')} />
    </Card>
  );
}

export function EmergencyCta({ title = 'Unplanned Power Failure?', body = 'Our high-voltage field team dispatches within 60 minutes across Gauteng for critical cable faults & generator panel failure.' }: { title?: string; body?: string }) {
  const content = usePublicContent();
  const line = content.data?.company.emergencyLine;
  return (
    <Card accent="danger" style={{ gap: spacing.md, backgroundColor: '#1E1418' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="alert-octagon" size={20} color="dangerBright" />
        <Text variant="h3" style={{ flex: 1 }}>{title}</Text>
        <Badge label="24/7 STANDBY" tone="danger" solid mono={false} />
      </View>
      <Text variant="bodySmall" color="textSecondary">{body}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Call Emergency Hotline" icon="phone-call" variant="danger" size="sm" style={{ flex: 1.3 }} onPress={() => line && void callNumber(line)} />
        <Button label="Contact Dispatch" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.navigate('/contact')} />
      </View>
    </Card>
  );
}

export function MarketingFooter() {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Icon name="map" size={14} color="primaryBright" />
        <Text variant="bodySmall" color="textSecondary">Johannesburg · Durban · Cape Town</Text>
        <Text variant="bodySmall" color="textMuted">·</Text>
        <Icon name="radio" size={14} color="secondaryBright" />
        <Text variant="bodySmall" color="textSecondary">24/7 Hotline</Text>
      </View>
      <Text variant="mono" color="textMuted" align="center" style={{ fontSize: 11 }}>© {new Date().getFullYear()} PSG Electrical and Cables (Pty) Ltd. All Rights Reserved.</Text>
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
