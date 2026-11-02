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
import type { PartnerCategory } from '@hydra/shared';
import { usePartners } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { PartnerCard, published } from '../../components/marketing';
import { QueryFallback, notReady } from '../../components/QueryState';
import { Button, Card, EmptyState, FilterChips, SearchField, Text, colors, spacing } from '../../design-system';

type Filter = 'ALL' | PartnerCategory;

/** Supplier and partner directory. Only published (non-demo) records appear. */
export default function PartnersScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const partners = usePartners({ category: filter === 'ALL' ? undefined : filter, search: search.trim() || undefined });
  const list = published(partners.data);
  const filtering = filter !== 'ALL' || !!search.trim();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Our Partners" back />
      <Screen withTabBar={false} onRefresh={() => void partners.refetch()} refreshing={partners.isRefetching}>
        <Card style={{ gap: spacing.md }}>
          <Text variant="h1">Partners & suppliers</Text>
          <Text variant="body" color="textMuted">PSG works with established suppliers to deliver installations that meet SANS 10142 wiring standards and industry best practice.</Text>
        </Card>
        {list.length || filtering ? (
          <>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search partners" />
            <FilterChips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'ALL', label: 'All', icon: 'layers' },
                { value: 'EQUIPMENT_OEM', label: 'Equipment', icon: 'cpu' },
                { value: 'SOLAR_STORAGE', label: 'Solar', icon: 'sun' },
                { value: 'CABLES_CONDUCTORS', label: 'Cables', icon: 'git-merge' },
                { value: 'COMPLIANCE_AUDITING', label: 'Compliance', icon: 'shield' },
                { value: 'ENTERPRISE_CLIENT', label: 'Clients', icon: 'briefcase' },
              ]}
            />
          </>
        ) : null}
        {notReady(partners) ? (
          <QueryFallback query={partners} />
        ) : !list.length ? (
          filtering ? (
            <EmptyState icon="search" title="No partners match" message="Try another search or filter." />
          ) : (
            <EmptyState icon="briefcase" title="Partner information coming soon" message="Supplier and partner details will be published here once confirmed by PSG Electrical & Cables." />
          )
        ) : (
          list.map((p) => <PartnerCard key={p.id} partner={p} />)
        )}

        <Card style={{ gap: spacing.md, alignItems: 'center' }}>
          <Text variant="h3" align="center">Planning an installation?</Text>
          <Text variant="bodySmall" color="textMuted" align="center">Share your requirements and we will recommend suitable equipment as part of your quotation.</Text>
          <Button label="Request a quote" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
        </Card>
      </Screen>
    </View>
  );
}
