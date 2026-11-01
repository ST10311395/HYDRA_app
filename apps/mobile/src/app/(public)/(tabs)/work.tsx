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
import { usePortfolio } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { ProjectCard, SectorList, TestimonialCard, published } from '../../../components/marketing';
import { Button, Card, EmptyState, ErrorState, FilterChips, Icon, IconTile, LoadingCards, SearchField, Text, colors, spacing } from '../../../design-system';

/** Core capability areas, from the PSG company portfolio. */
const CAPABILITIES = [
  'Industrial electrical installations and upgrades',
  'Cable management systems and infrastructure',
  'Distribution board (DB) installations and reconfiguration',
  'Fault finding and system diagnostics',
  'Electrical maintenance in operational environments',
  'Support for solar electrical integration',
];

type Filter = 'ALL' | PortfolioCategory;

export default function WorkScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const projects = usePortfolio({ category: filter === 'ALL' ? undefined : filter, search: search.trim() || undefined });
  const list = published(projects.data);
  const filtering = filter !== 'ALL' || !!search.trim();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Recent Work" />
      <Screen onRefresh={() => void projects.refetch()} refreshing={projects.isRefetching}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="h1">Our work</Text>
          <Text variant="body" color="textMuted">PSG has established itself as a dependable service provider across multiple sectors, offering both project-based installations and long-term maintenance support.</Text>
        </View>

        {list.length || filtering ? (
          <>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search projects" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', icon: 'sliders' },
            { value: 'INDUSTRIAL', label: 'Industrial', icon: 'bar-chart-2' },
            { value: 'COMMERCIAL', label: 'Commercial', icon: 'grid' },
            { value: 'SOLAR', label: 'Solar', icon: 'sun' },
          ]}
        />
          </>
        ) : null}
        {projects.isLoading ? (
          <LoadingCards count={2} />
        ) : projects.isError ? (
          <ErrorState onRetry={() => void projects.refetch()} />
        ) : !list.length ? (
          filtering ? (
            <EmptyState icon="briefcase" title="No projects found" message="Try another filter or search term." />
          ) : (
            <>
              <EmptyState icon="briefcase" title="Case studies coming soon" message="Project case studies will be published here once approved by PSG Electrical & Cables." />
              <SectorList />
              <Card style={{ gap: spacing.md }} testID="capabilities">
                <Text variant="h3">Core capability areas</Text>
                {CAPABILITIES.map((c) => (
                  <View key={c} style={{ flexDirection: 'row', gap: 10 }}>
                    <Icon name="check-circle" size={16} color="primaryBright" />
                    <Text variant="bodySmall" style={{ flex: 1 }}>{c}</Text>
                  </View>
                ))}
              </Card>
            </>
          )
        ) : (
          list.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
        <TestimonialCard />
        <Card accent="primary" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <IconTile icon="zap" tone="primary" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h2">Have a similar project?</Text>
              <Text variant="bodySmall" color="textMuted">Tell us about the site and the work needed. We will arrange an assessment where needed and send a clear quotation.</Text>
            </View>
          </View>
          <Button label="Request a quote" icon="file-text" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
        </Card>
      </Screen>
    </View>
  );
}
