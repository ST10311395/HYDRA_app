import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ServiceCategory } from '@hydra/shared';
import { useServices } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { EmergencyCta, ServiceCard } from '../../../components/marketing';
import { Badge, Button, Card, EmptyState, ErrorState, FilterChips, Icon, IconTile, Label, LoadingCards, SearchField, Segmented, Text, colors, radius, spacing } from '../../../design-system';
import { Slider } from '../../../design-system/Slider';
import { estimateScope, type Sector } from '../../../features/estimator';

type Filter = 'ALL' | ServiceCategory;

const FILTERS: { value: Filter; label: string; icon: 'layers' | 'sun' | 'git-merge' | 'zap' | 'alert-triangle' | 'shield' | 'cpu' }[] = [
  { value: 'ALL', label: 'All Services', icon: 'layers' },
  { value: 'SOLAR', label: 'Solar & Renewables', icon: 'sun' },
  { value: 'CABLING', label: 'Cabling & Fiber', icon: 'git-merge' },
  { value: 'SUBSTATIONS', label: 'Substations', icon: 'zap' },
  { value: 'EMERGENCY', label: 'Emergency', icon: 'alert-triangle' },
  { value: 'COMPLIANCE', label: 'CoC & Audits', icon: 'shield' },
  { value: 'AUTOMATION', label: 'Automation', icon: 'cpu' },
];

const CERTS = [
  ['ISO 9001:2015', 'Quality Management Systems'],
  ['SANS 10142-1', 'Electrical Code Compliant'],
  ['Dept of Labour', 'Registered Contractors'],
  ['ECA & ECB', 'Master Electrician Sign-off'],
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
  const solar = (services.data ?? []).find((s) => s.category === 'SOLAR');
  const quoteFor = (id: string) => router.navigate({ pathname: '/quote', params: { serviceTypeId: id } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Our Services" />
      <Screen onRefresh={() => void services.refetch()} refreshing={services.isRefetching}>
        <View style={{ gap: spacing.sm }}>
          <Label color="primaryBright" style={{ fontSize: 12 }}>South Africa Wide ▪ ISO 9001 Certified</Label>
          <Text variant="display" style={{ fontSize: 26 }}>CORE ENGINEERING SERVICES</Text>
          <Text variant="body" color="textMuted">Precision high-voltage electrical, renewable solar micro-grids, fiber optic cabling, and emergency maintenance.</Text>
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search services, e.g., Solar, 33kV, CoC…" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

        {filter === 'ALL' && !search && solar ? (
          <Card accent="secondary" style={{ gap: spacing.md, backgroundColor: '#1A1526' }}>
            <View style={styles.between}>
              <Badge label="Featured Renewable Tech" icon="star" tone="secondary" mono={false} />
              <Label color="textMuted">NRS 097 Compliant</Label>
            </View>
            <Text variant="h1" style={{ fontSize: 22 }}>Tribe Solar & Industrial BESS Micro-Grids</Text>
            <Text variant="body" color="textMuted">Eliminate load-shedding downtime with integrated hybrid solar, battery backup, and automatic generator sync.</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={styles.featStat}><Icon name="check-circle" size={16} color="secondaryBright" /><View><Text variant="caption" color="textMuted">Uptime Guarantee</Text><Text variant="title" weight="bold">99.8% Reliability</Text></View></View>
              <View style={styles.featStat}><Icon name="award" size={16} color="primaryBright" /><View style={{ flex: 1 }}><Text variant="caption" color="textMuted">Solar Module Specs</Text><Text variant="title" weight="bold">25-Year Performance</Text></View></View>
            </View>
            <Button label="Request Solar Feasibility Audit" icon="file-text" onPress={() => quoteFor(solar.id)} />
          </Card>
        ) : null}

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
            <View style={[styles.between, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8 }]}>
              <Text variant="bodySmall" color="textMuted">Est. Turnaround SLA:</Text>
              <Text variant="bodySmall" weight="bold" color="primaryBright">{estimate.sla}</Text>
            </View>
          </View>
          <Button label="Apply Scope to Quote Request" iconRight="chevron-right" onPress={() => router.navigate({ pathname: '/quote', params: { sector: estimate.quoteSector, kva: String(kva) } })} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="shield" size={18} color="secondaryBright" />
            <Text variant="title" weight="bold">CERTIFICATIONS & COMPLIANCE ASSURANCE</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md }}>
            {CERTS.map(([b, t]) => (
              <View key={b} style={{ width: '50%', flexDirection: 'row', gap: 6, paddingRight: 8 }}>
                <Icon name="check" size={15} color="primaryBright" />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}><Text variant="caption" weight="bold">{b} </Text>{t}</Text>
              </View>
            ))}
          </View>
        </Card>

        <EmergencyCta />

        <Card style={{ gap: spacing.md, alignItems: 'center' }}>
          <Text variant="h3" align="center">Need a Custom Engineering Solution?</Text>
          <Text variant="bodySmall" color="textMuted" align="center">Share your project scope, drawings and site details for an accurate technical quotation within 24 hours.</Text>
          <Button label="Open Quotation Request Form" icon="file-text" onPress={() => router.navigate('/quote')} />
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
