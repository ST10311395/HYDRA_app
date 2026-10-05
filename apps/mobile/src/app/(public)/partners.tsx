import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PartnerCategory } from '@hydra/shared';
import { usePartners, usePublicContent } from '../../api/queries';
import { BrandHeader, DemoNote, Screen } from '../../components/layout';
import { PartnerCard } from '../../components/marketing';
import { Badge, Button, Card, EmptyState, FilterChips, Icon, IconTile, SearchField, Text, colors, radius, spacing } from '../../design-system';
import { callNumber } from '../../utils/links';
import { QueryFallback, notReady } from '../../components/QueryState';

type Filter = 'ALL' | PartnerCategory;

const REG = [
  ['SANS 10142-1', 'Low/Med Voltage Compliance', 'secondary'],
  ['IEC 61439', 'Switchgear Enclosure Certified', 'primary'],
  ['SABS Flame Retardant', 'Heavy Armored Cable Fire Test', 'secondary'],
  ['Department of Labour', 'Registered Electrical Contractor', 'primary'],
] as const;

export default function PartnersScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const partners = usePartners({ category: filter === 'ALL' ? undefined : filter, search: search.trim() || undefined });
  const content = usePublicContent();
  const metrics = content.data?.metrics.filter((m) => m.group === 'partners') ?? [];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Our Partners" back />
      <Screen withTabBar={false} onRefresh={() => void partners.refetch()} refreshing={partners.isRefetching}>
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge label="APPROVED SUPPLY NETWORK" icon="shield" tone="primary" />
            <Badge label="Tier-1 OEM" tone="secondary" />
          </View>
          <Text variant="h1">Direct Tier-1 Partnerships & Compliance Alliances</Text>
          <Text variant="body" color="textMuted">We source directly from accredited manufacturers and SABS-certified component suppliers, backing every project with factory warranties and statutory compliance.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {metrics.map((m) => (
              <View key={m.key} style={styles.metric}>
                <Text variant="h2" color={m.accent === 'primary' ? 'primaryBright' : m.accent === 'secondary' ? 'secondaryBright' : 'text'}>{m.value}</Text>
                <Text variant="caption" color="textMuted">{m.label}</Text>
              </View>
            ))}
          </View>
        </Card>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search partner, component, or certification…" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All Network', icon: 'layers' },
            { value: 'EQUIPMENT_OEM', label: 'OEM Equipment', icon: 'cpu' },
            { value: 'SOLAR_STORAGE', label: 'Solar Tech', icon: 'sun' },
            { value: 'CABLES_CONDUCTORS', label: 'Cables', icon: 'git-merge' },
            { value: 'COMPLIANCE_AUDITING', label: 'Compliance', icon: 'shield' },
            { value: 'ENTERPRISE_CLIENT', label: 'Enterprise', icon: 'briefcase' },
          ]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="bar-chart-2" size={18} color="primaryBright" /><Text variant="title" weight="bold">PARTNER DIRECTORY ({partners.data?.length ?? 0})</Text></View>
        </View>
        {notReady(partners) ? <QueryFallback query={partners} /> : !partners.data?.length ? <EmptyState icon="search" title="No partners match" message="Try another search or filter." /> : partners.data.map((p) => <PartnerCard key={p.id} partner={p} />)}
        <DemoNote show={partners.data?.some((p) => p.isDemo)} />

        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconTile icon="award" />
            <View style={{ flex: 1 }}>
              <Text variant="h3">SABS & Regulatory Compliance</Text>
              <Text variant="caption" color="textMuted">Verified South African Standard Approvals</Text>
            </View>
          </View>
          <Text variant="bodySmall" color="textMuted">All cables, switchgear, solar components, and fiber optic feeds deployed by PSG Electrical strictly comply with SANS 10142-1 Wiring Code and ISO 9001 Quality Frameworks.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {REG.map(([t, c, tone]) => (
              <View key={t} style={styles.reg}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Icon name="check-circle" size={15} color={tone === 'primary' ? 'primaryBright' : 'secondaryBright'} />
                  <Text variant="title" weight="bold" style={{ flex: 1 }}>{t}</Text>
                </View>
                <Text variant="caption" color="textMuted">{c}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card accent="secondary" style={{ gap: spacing.md, backgroundColor: '#18152A' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="truck" size={18} color="primaryBright" /><Text variant="title" weight="bold">24-HOUR SPARES DISPATCH</Text></View>
            <Badge label="Direct Warehouse" tone="primary" mono={false} />
          </View>
          <Text variant="bodySmall" color="textSecondary">Our strategic partnerships with local distributors allow us to maintain direct access to critical industrial spares, reducing emergency downtime for clients across South Africa.</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="check" size={14} color="secondaryBright" /><Text variant="caption" weight="bold">Gauteng & Western Cape Depots</Text></View>
            <Pressable accessibilityRole="link" onPress={() => router.navigate('/contact')} hitSlop={10}><Text variant="bodySmall" color="primaryBright">Contact Spares Desk ›</Text></Pressable>
          </View>
        </Card>

        <Card style={{ gap: spacing.md, alignItems: 'center' }}>
          <View style={styles.sparkle}><Icon name="star" size={20} color="primaryBright" /></View>
          <Text variant="h3" align="center">Looking for Approved Partner Components?</Text>
          <Text variant="bodySmall" color="textMuted" align="center">Request an engineering consultation or submit component specifications for your upcoming electrical or solar installation.</Text>
          <Button label="Request Component Quotation" iconRight="arrow-right" onPress={() => router.navigate('/quote')} />
          <Button label="Talk to Engineering Team" icon="phone-call" variant="secondary" onPress={() => content.data && void callNumber(content.data.company.hotline)} />
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  reg: { width: '48.5%', flexGrow: 1, gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  sparkle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
});
