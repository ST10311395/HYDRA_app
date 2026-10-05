/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { usePortfolio, usePublicContent, useServices } from '../../../api/queries';
import { imageFor } from '../../../components/images';
import { BrandHeader, DemoNote, Screen } from '../../../components/layout';
import { MarketingFooter, ProjectMiniCard, QuoteCta, ServiceMiniCard, TestimonialCard } from '../../../components/marketing';
import { Badge, Button, Card, HorizontalScroller, Icon, IconTile, Label, LoadingCards, MonoHeading, SectionHeader, StatTile, Text, colors, radius, spacing } from '../../../design-system';
import { homeForRole, useAuth } from '../../../store/auth';
import { callNumber } from '../../../utils/links';
import { QueryFallback, notReady } from '../../../components/QueryState';

const TRUST = [
  { label: 'ISO 9001 Certified', tone: 'primaryBright' as const },
  { label: 'Master Electricians', tone: 'secondaryBright' as const },
  { label: '24/7 Hotline Service', tone: 'primaryBright' as const },
  { label: 'ECA & NSI Accredited', tone: 'secondaryBright' as const },
];

const STAT_ICON = { years: 'award', solar: 'sun', uptime: 'shield', dispatch: 'clock' } as const;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * 0.62, 300);
  const content = usePublicContent();
  const services = useServices();
  const featured = usePortfolio({ featured: 'true' });
  const user = useAuth((s) => s.user);
  const metrics = content.data?.metrics.filter((m) => m.group === 'home') ?? [];
  const emergency = content.data?.company.emergencyLine;
  const refreshing = content.isRefetching || services.isRefetching;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Home" />
      <Screen onRefresh={() => void Promise.all([content.refetch(), services.refetch(), featured.refetch()])} refreshing={refreshing}>
        {user ? (
          <Card accent="primary" onPress={() => router.navigate(homeForRole(user.role))} accessibilityLabel="Open my dashboard">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconTile icon="grid" />
              <View style={{ flex: 1 }}>
                <Text variant="title" weight="bold">Welcome back, {user.firstName}</Text>
                <Text variant="caption" color="textMuted">Open your dashboard</Text>
              </View>
              <Icon name="arrow-right" color="primaryBright" />
            </View>
          </Card>
        ) : null}

        {/* 1 · Hero */}
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={styles.heroTag}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <Icon name="zap" size={15} color="primaryBright" />
              <Label color="primaryBright" style={{ fontSize: 12, flexShrink: 1 }}>High-Voltage & Renewables</Label>
            </View>
            <Badge label={`EST. ${content.data?.company.established ?? 2008}`} tone="primary" />
          </View>
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <View>
              <Text variant="display">PRECISION INDUSTRIAL</Text>
              <Text variant="display" color="primaryBright">ELECTRICAL & SOLAR</Text>
            </View>
            <Text variant="body" color="textMuted">
              Turnkey high-voltage substations, commercial solar PV plants, industrial cabling, and 24/7 rapid emergency fault dispatch across South Africa.
            </Text>
            <View style={styles.heroImage}>
              <Image source={imageFor('hero-substation')} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Engineer testing a substation panel" />
              <View style={styles.heroCaption}>
                <Icon name="activity" size={15} color="primaryBright" />
                <Text variant="title" style={{ flex: 1 }}>33kV Substation Panel Testing</Text>
                <Label color="secondaryBright">Live Dispatch</Label>
              </View>
            </View>
            <View style={styles.trustGrid}>
              {TRUST.map((t) => (
                <View key={t.label} style={styles.trust}>
                  <Icon name="check-circle" size={15} color={t.tone} />
                  <Text variant="caption" weight="semibold" style={{ flex: 1 }}>{t.label}</Text>
                </View>
              ))}
            </View>
            <Button label="Request Project Quotation" icon="file-text" iconRight="arrow-right" size="lg" onPress={() => router.navigate('/quote')} haptic />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Explore Services" icon="tool" variant="secondary" style={{ flex: 1 }} onPress={() => router.navigate('/services')} />
              <Button label="24/7 Emergency" icon="shield" variant="dangerOutline" style={{ flex: 1 }} onPress={() => emergency && void callNumber(emergency)} />
            </View>
          </View>
        </Card>

        {/* 2 · Performance track record */}
        <MonoHeading right={<Label color="primaryBright">{new Date().getFullYear()} Metrics</Label>}>{'// PERFORMANCE TRACK RECORD'}</MonoHeading>
        <View style={styles.grid2}>
          {metrics.map((m) => (
            <View key={m.key} style={styles.half}>
              <StatTile value={m.value} label={m.label} caption={m.caption} accent={m.accent} icon={STAT_ICON[m.key as keyof typeof STAT_ICON]} />
            </View>
          ))}
        </View>

        {/* 3 · Core services */}
        <SectionHeader title="Core Services" subtitle="Turnkey industrial & commercial solutions" actionLabel="View All" onAction={() => router.navigate('/services')} />
        {services.isLoading ? (
          <LoadingCards count={1} />
        ) : (
          <HorizontalScroller contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }} snapInterval={cardWidth + spacing.md}>
            {(services.data ?? []).map((item) => <ServiceMiniCard key={item.id} service={item} width={cardWidth} />)}
          </HorizontalScroller>
        )}

        {/* 4 · Safety & ISO compliance */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <IconTile icon="shield" />
            <View style={{ flex: 1 }}>
              <Text variant="title" weight="bold">SAFETY & ISO COMPLIANCE</Text>
              <Text variant="bodySmall" color="textMuted">Certified technical excellence & zero-compromise standards</Text>
            </View>
          </View>
          <View style={styles.certImage}>
            <Image source={imageFor('compliance-certificate')} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Electrical compliance certificate" />
            <View style={styles.certPill}><Text variant="mono" style={{ fontSize: 11 }}>COMPLIANCE REF: ISO-9001:2015</Text></View>
          </View>
          {[
            ['Certified High Voltage Technicians:', 'All site managers hold certified HV switching credentials.'],
            ['Department of Labour Registered:', 'Full Certificate of Compliance (CoC) issuance authority.'],
          ].map(([b, t]) => (
            <View key={b} style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="check-circle" size={16} color="primaryBright" />
              <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}><Text variant="bodySmall" weight="bold">{b} </Text>{t}</Text>
            </View>
          ))}
          <Button label="Read Compliance & Accreditation Policy" iconRight="external-link" variant="secondary" onPress={() => router.push('/why-psg')} />
        </Card>

        {/* 5 · Recent projects + testimonial */}
        <SectionHeader title="Recent Projects" subtitle="Industrial & commercial portfolio showcase" actionLabel="Portfolio" onAction={() => router.navigate('/work')} />
        {notReady(featured) ? <QueryFallback query={featured} count={2} /> : (featured.data ?? []).map((p) => <ProjectMiniCard key={p.id} project={p} />)}
        <TestimonialCard />
        <DemoNote show={content.data?.isDemoContent} />

        {/* 6 · Final CTA + footer */}
        <QuoteCta />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Why Choose PSG" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.push('/why-psg')} />
          <Button label="Partners" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.push('/partners')} />
          <Button label="Our Team" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.push('/team')} />
        </View>
        {!user ? (
          <Card elevated style={{ gap: spacing.md }}>
            <Text variant="title" weight="bold">Track your jobs, quotes & rewards</Text>
            <Text variant="bodySmall" color="textMuted">Create a free account to request services, follow your electrician live and pay invoices securely.</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Sign in" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/login')} />
              <Button label="Create account" style={{ flex: 1 }} onPress={() => router.push('/register')} />
            </View>
          </Card>
        ) : null}
        <MarketingFooter />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  heroTag: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: '#161E2C', borderBottomWidth: 1, borderColor: colors.border },
  heroImage: { height: 210, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, justifyContent: 'flex-end', padding: spacing.sm },
  heroCaption: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(11,15,22,0.85)', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
  trustGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trust: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceElevated, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  half: { width: '47.5%', flexGrow: 1 },
  certImage: { height: 130, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.sm },
  certPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(11,15,22,0.9)', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 4 },
});
