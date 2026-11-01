/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { usePortfolio, usePublicContent, useServices } from '../../../api/queries';
import { BrandBackdrop } from '../../../components/BrandBackdrop';
import { BrandHeader, Screen } from '../../../components/layout';
import { MarketingFooter, ProjectMiniCard, QualityCard, ServiceMiniCard, TestimonialCard, published } from '../../../components/marketing';
import { PSG_CONTACT } from '../../../content/company';
import { HERO, SAFETY_NOTE } from '../../../content/marketing';
import { Button, Card, HorizontalScroller, Icon, IconTile, Label, LoadingCards, SectionHeader, Text, colors, spacing } from '../../../design-system';
import { homeForRole, useAuth } from '../../../store/auth';
import { callNumber } from '../../../utils/links';
import { QueryFallback, notReady } from '../../../components/QueryState';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * 0.62, 300);
  const content = usePublicContent();
  const services = useServices();
  const featured = usePortfolio({ featured: 'true' });
  const user = useAuth((s) => s.user);
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

        {/* 1 · Hero (client screenshot IMG-20261021-WA0010): hazardous-area testing focus, no 24/7 or HV claims */}
        <Card padded={false} style={{ overflow: 'hidden' }} testID="home-hero">
          <BrandBackdrop height={180} />
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Label color="primaryBright" style={{ fontSize: 12 }}>{HERO.eyebrow}</Label>
            <Text variant="display" accessibilityRole="header">{HERO.title}</Text>
            <Text variant="body" color="textSecondary">{HERO.body}</Text>
            <Button label="Request a quote" icon="file-text" iconRight="arrow-right" size="lg" onPress={() => router.navigate('/quote')} haptic testID="home-quote" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Report a fault" icon="alert-triangle" variant="dangerOutline" style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/quote', params: { sector: 'EMERGENCY' } })} testID="home-fault" />
              <Button label="Call PSG" icon="phone-call" variant="secondary" style={{ flex: 1 }} onPress={() => void callNumber(PSG_CONTACT.primaryPhone)} testID="home-call" />
            </View>
            <Text variant="caption" color="textMuted">Office hours {PSG_CONTACT.hours}. {SAFETY_NOTE}</Text>
          </View>
        </Card>

        {/* 3 · Core services */}
        <SectionHeader title="Our services" actionLabel="View all" onAction={() => router.navigate('/services')} />
        {services.isLoading ? (
          <LoadingCards count={1} />
        ) : (
          <HorizontalScroller contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }} snapInterval={cardWidth + spacing.md}>
            {(services.data ?? []).map((item) => <ServiceMiniCard key={item.id} service={item} width={cardWidth} />)}
          </HorizontalScroller>
        )}

        {/* 4 · Quality & compliance (portfolio statement, no certification claims) */}
        <QualityCard />

        {/* 5 · Recent projects + testimonial */}
        {notReady(featured) ? <QueryFallback query={featured} count={2} /> : published(featured.data).length ? (
          <>
            <SectionHeader title="Recent projects" actionLabel="Our work" onAction={() => router.navigate('/work')} />
            {published(featured.data).map((p) => <ProjectMiniCard key={p.id} project={p} />)}
          </>
        ) : null}
        <TestimonialCard />

        {/* Footer: About links (Why PSG, team, partners, FAQ) moved here from the removed promo tiles */}
        <MarketingFooter />
      </Screen>
    </View>
  );
}

