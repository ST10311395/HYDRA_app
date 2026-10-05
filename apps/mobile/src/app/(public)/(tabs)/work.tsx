/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { PortfolioCategory } from '@hydra/shared';
import { usePortfolio, usePublicContent } from '../../../api/queries';
import { BrandHeader, DemoNote, Screen } from '../../../components/layout';
import { ProjectCard, TestimonialCard } from '../../../components/marketing';
import { Badge, Button, Card, EmptyState, ErrorState, FilterChips, Icon, IconTile, Label, LoadingCards, SearchField, Text, colors, spacing } from '../../../design-system';

type Filter = 'ALL' | PortfolioCategory;

export default function WorkScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const projects = usePortfolio({ category: filter === 'ALL' ? undefined : filter, search: search.trim() || undefined });
  const content = usePublicContent();
  const m = content.data?.metrics.filter((x) => x.group === 'work') ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Recent Work" />
      <Screen onRefresh={() => void projects.refetch()} refreshing={projects.isRefetching}>
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Badge label="TRACK RECORD" tone="primary" />
            <Text variant="mono" color="textMuted">2012 – {new Date().getFullYear()} Portfolio</Text>
          </View>
          <Text variant="display" style={{ fontSize: 26 }}>Proven Engineering Excellence</Text>
          <Text variant="body" color="textMuted">Explore our completed high-voltage, commercial, solar, and infrastructure projects delivered across South Africa.</Text>
        </View>
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row' }}>
            {m.map((x, i) => (
              <View key={x.key} style={{ flex: 1, gap: 2, paddingLeft: i ? spacing.md : 0, borderLeftWidth: i ? 1 : 0, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Icon name={i ? 'sun' : 'briefcase'} size={14} color={i ? 'secondaryBright' : 'primaryBright'} />
                  <Label>{x.label}</Label>
                </View>
                <Text variant="stat">{x.value}</Text>
                <Text variant="caption" color="textMuted">{x.caption}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="shield" size={14} color="secondaryBright" /><Text variant="bodySmall" color="textMuted">Zero Incident Safety Record</Text></View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="award" size={14} color="primaryBright" /><Text variant="mono" style={{ fontSize: 12 }}>100% CoC Compliance</Text></View>
          </View>
        </Card>

        <SearchField value={search} onChangeText={setSearch} placeholder="Search by client, location, or tech…" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', icon: 'sliders' },
            { value: 'INDUSTRIAL', label: 'Industrial', icon: 'bar-chart-2' },
            { value: 'COMMERCIAL', label: 'Commercial', icon: 'grid' },
            { value: 'SOLAR', label: 'Solar', icon: 'sun' },
            { value: 'DATA_FIBRE', label: 'Data & Fiber', icon: 'server' },
          ]}
        />
        <Text variant="bodySmall" color="textMuted">Showing <Text variant="bodySmall" weight="bold">{projects.data?.length ?? 0}</Text> projects</Text>
        {projects.isLoading ? (
          <LoadingCards count={2} />
        ) : projects.isError ? (
          <ErrorState onRetry={() => void projects.refetch()} />
        ) : !projects.data?.length ? (
          <EmptyState icon="briefcase" title="No projects found" message="Try another filter or search term." />
        ) : (
          projects.data.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
        <TestimonialCard />
        <DemoNote show={projects.data?.some((p) => p.isDemo)} />
        <Card accent="primary" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <IconTile icon="zap" tone="primary" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h2">Have a Similar Infrastructure Project?</Text>
              <Text variant="bodySmall" color="textMuted">Get a comprehensive engineering estimate and site inspection from our registered master electricians.</Text>
            </View>
          </View>
          <Button label="Request Detailed Project Quote" icon="file-text" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
        </Card>
      </Screen>
    </View>
  );
}
