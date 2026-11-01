/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ServiceCategory } from '@hydra/shared';
import { useServices } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { FaultCta, QualityCard, ServiceCard } from '../../../components/marketing';
import { Button, Card, EmptyState, ErrorState, FilterChips, IconTile, Label, LoadingCards, SearchField, Segmented, Text, colors, radius, spacing, type IconName } from '../../../design-system';
import { Slider } from '../../../design-system/Slider';
import { estimateScope, type Sector } from '../../../features/estimator';
import { TAGLINE } from '../../../content/marketing';
import { SERVICE_CATEGORY_LABEL, SERVICE_ICON } from '../../../utils/format';

type Filter = 'ALL' | ServiceCategory;

const FILTERS: { value: Filter; label: string; icon: IconName }[] = [
  { value: 'ALL', label: 'All services', icon: 'layers' },
  ...(['CABLING', 'EMERGENCY', 'SUBSTATIONS', 'COMPLIANCE', 'AUTOMATION', 'SOLAR'] as const).map((c) => ({ value: c, label: SERVICE_CATEGORY_LABEL[c], icon: SERVICE_ICON[c]! })),
];

export default function ServicesScreen() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const services = useServices(filter === 'ALL' ? {} : { category: filter });
  const [sector, setSector] = useState<Sector>('industrial');
  const [kva, setKva] = useState(150);
  const estimate = useMemo(() => estimateScope(sector, kva), [sector, kva]);

  const visible = (services.data ?? []).filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [s.name, s.description, ...s.specs.map((x) => x.value), ...s.features].some((t) => t.toLowerCase().includes(q));
  });
  const quoteFor = (id: string) => router.navigate({ pathname: '/quote', params: { serviceTypeId: id } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Our Services" />
      <Screen onRefresh={() => void services.refetch()} refreshing={services.isRefetching}>
        <View style={{ gap: spacing.sm }}>
          <Label color="primaryBright" style={{ fontSize: 12 }}>{TAGLINE}</Label>
          <Text variant="h1">Our services</Text>
          <Text variant="body" color="textMuted">Electrical engineering and cabling for residential, commercial and industrial customers, with solar and backup power through Trite Solar.</Text>
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search services, e.g. CoC, DB board, solar" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        <Label>Showing {visible.length} services</Label>
        {services.isLoading ? (
          <LoadingCards count={2} />
        ) : services.isError ? (
          <ErrorState onRetry={() => void services.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="No matching services" message="Try a different keyword or filter." />
        ) : (
          visible.map((s) => <ServiceCard key={s.id} service={s} onQuote={() => quoteFor(s.id)} />)
        )}

        {/* Project scope estimator */}
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconTile icon="sliders" />
            <View style={{ flex: 1 }}>
              <Text variant="h3">Project Scope Estimator</Text>
              <Text variant="caption" color="textMuted">Calculate required power rating & team deployment</Text>
            </View>
          </View>
          <Label>Select Sector</Label>
          <Segmented
            value={sector}
            onChange={setSector}
            options={[
              { value: 'industrial', label: 'industrial' },
              { value: 'commercial', label: 'commercial' },
              { value: 'residential', label: 'residential' },
            ]}
          />
          <View style={styles.between}>
            <Text variant="bodySmall" color="textSecondary">Project Power Load (kVA)</Text>
            <Text variant="mono" color="primaryBright" style={{ fontSize: 16 }}>{kva} kVA</Text>
          </View>
          <Slider value={kva} min={20} max={500} step={10} onChange={setKva} label="Project power load in kVA" />
          <View style={styles.between}>
            {['20 kVA', '250 kVA', '500 kVA+'].map((l) => <Text key={l} variant="mono" color="textMuted" style={{ fontSize: 11 }}>{l}</Text>)}
          </View>
          <View style={styles.estimate}>
            {[
              ['Deployment Tier:', estimate.tier],
              ['Required Crew:', estimate.crew],
              ['Recommended Cabling:', estimate.cabling],
            ].map(([k, v]) => (
              <View key={k} style={styles.between}>
                <Text variant="bodySmall" color="textMuted">{k}</Text>
                <Text variant="bodySmall" weight="bold" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Text>
              </View>
            ))}
            <Text variant="caption" color="textMuted">Indicative only. Your quotation confirms the scope after assessment.</Text>
          </View>
          <Button label="Apply Scope to Quote Request" iconRight="chevron-right" onPress={() => router.navigate({ pathname: '/quote', params: { sector: estimate.quoteSector, kva: String(kva) } })} />
        </Card>

        <QualityCard />

        <FaultCta />

        <Card style={{ gap: spacing.md, alignItems: 'center' }}>
          <Text variant="h3" align="center">Not sure which service you need?</Text>
          <Text variant="bodySmall" color="textMuted" align="center">Describe the work and share any photos or drawings. We will review it and contact you to confirm the scope.</Text>
          <Button label="Request a quote" icon="file-text" onPress={() => router.navigate('/quote')} />
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  featStat: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.surfaceInset, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10 },
  estimate: { backgroundColor: colors.surfaceInset, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 },
});
