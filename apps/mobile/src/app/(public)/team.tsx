import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { TeamCategory, TeamMemberDto } from '@hydra/shared';
import { usePublicContent, useTeam } from '../../api/queries';
import { BrandHeader, DemoNote, Screen } from '../../components/layout';
import { TeamCard } from '../../components/marketing';
import { Accordion, Badge, Button, Card, EmptyState, FilterChips, Icon, KeyValue, LoadingCards, SearchField, Text, colors, radius, spacing } from '../../design-system';
import { callNumber } from '../../utils/links';

type Filter = 'ALL' | TeamCategory;

const INSTITUTIONAL = [
  ['ECSA Registered Engineers', 'Pr.Eng & Pr.Tech', 'Engineering Council of South Africa certified professionals on every project.', 'award'],
  ['SANS 10142 Compliance', 'Wiring Code 100%', 'Guaranteed valid Certificate of Compliance (CoC) issued for all installations.', 'shield'],
  ['Master Wireman Licensed', 'Department of Labour', 'Single & three-phase wireman licenses held by all senior field inspectors.', 'tool'],
  ['Tribe Solar Master Certified', 'PV GreenCard Accredited', 'Authorized installers for commercial solar PV and industrial battery storage.', 'zap'],
] as const;

export default function TeamScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [creds, setCreds] = useState<TeamMemberDto | null>(null);
  const team = useTeam({ category: filter === 'ALL' ? undefined : filter, search: search.trim() || undefined });
  const content = usePublicContent();
  const metrics = content.data?.metrics.filter((m) => m.group === 'team') ?? [];
  const hotline = content.data?.company.hotline;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Meet the Team" back />
      <Screen withTabBar={false} onRefresh={() => void team.refetch()} refreshing={team.isRefetching}>
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge label="ECSA CERTIFIED TEAM" icon="user-check" tone="primary" />
            <Badge label="50+ Field Experts" tone="secondary" />
          </View>
          <Text variant="h1">Master Electricians & Engineers</Text>
          <Text variant="body" color="textMuted">Direct access to South Africa’s top licensed electrical engineers, Wireman’s License holders, and compliance auditors.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {metrics.map((m) => (
              <View key={m.key} style={styles.metric}>
                <Text variant="h3" color={m.accent === 'primary' ? 'primaryBright' : m.accent === 'secondary' ? 'secondaryBright' : 'text'}>{m.value}</Text>
                <Text variant="caption" color="textMuted" align="center">{m.label}</Text>
              </View>
            ))}
          </View>
        </Card>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search by name, skill, or certification…" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All Team' },
            { value: 'ENGINEERING', label: 'Engineering' },
            { value: 'TECHNICIANS', label: 'Technicians' },
            { value: 'MANAGEMENT', label: 'Management' },
            { value: 'COMPLIANCE', label: 'Compliance' },
          ]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="bodySmall" color="textMuted">Showing {team.data?.length ?? 0} Team Members</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="star" size={13} color="primaryBright" /><Text variant="bodySmall" color="primaryBright">Verified Credentials</Text></View>
        </View>
        {team.isLoading ? (
          <LoadingCards />
        ) : !team.data?.length ? (
          <EmptyState icon="users" title="No team members found" message="Try another search." />
        ) : (
          team.data.map((m) => (
            <TeamCard key={m.id} member={m} onCredentials={() => setCreds(m)} onCall={() => hotline && void callNumber(hotline)} />
          ))
        )}
        <DemoNote show={team.data?.some((m) => m.isDemo)} />

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="shield" size={18} color="primaryBright" /><Text variant="h3">Institutional Certifications & Safety</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {INSTITUTIONAL.map(([t, s, b, icon]) => (
            <View key={t} style={styles.inst}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={styles.instIcon}><Icon name={icon} size={16} color="primaryBright" /></View>
                <Badge label="VERIFIED" tone="neutral" />
              </View>
              <Text variant="title" weight="bold">{t}</Text>
              <Text variant="mono" color="primaryBright" style={{ fontSize: 11 }}>{s}</Text>
              <Text variant="caption" color="textMuted">{b}</Text>
            </View>
          ))}
        </View>
        <Accordion title="View Safety & CoC Guarantee Policy">
          Every installation is inspected by a registered Master Electrician and issued with a Certificate of Compliance per SANS 10142-1. Workmanship is guaranteed for 36 months, and site safety follows the Occupational Health and Safety Act with zero-harm targets on all high-voltage work.
        </Accordion>

        <Card accent="primary" style={{ gap: spacing.md }}>
          <Badge label="DIRECT DISPATCH" tone="primary" />
          <Text variant="h2">Need a Specialist Assigned to Your Project?</Text>
          <Text variant="bodySmall" color="textMuted">Request a specific engineer or master electrician for your industrial site audit or solar installation.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Request Quotation" icon="file-text" style={{ flex: 1 }} onPress={() => router.navigate('/quote')} />
            <Button label="Contact" icon="phone" variant="secondary" fullWidth={false} onPress={() => router.navigate('/contact')} />
          </View>
        </Card>
      </Screen>

      <Modal visible={!!creds} transparent animationType="fade" onRequestClose={() => setCreds(null)}>
        <Pressable style={styles.backdrop} onPress={() => setCreds(null)} accessibilityLabel="Close credentials" />
        <View style={styles.sheet}>
          <Text variant="h2">{creds?.name}</Text>
          <Text variant="bodySmall" color="primaryBright">{creds?.title}</Text>
          <View style={{ marginTop: spacing.md }}>
            <KeyValue label="Registration" value={creds?.registration ?? '—'} mono />
            <KeyValue label="Licence" value={creds?.licence ?? '—'} mono />
            <KeyValue label="Experience" value={`${creds?.experienceYears ?? 0} years`} />
            <KeyValue label="Projects delivered" value={`${creds?.projectsCount ?? 0}+`} />
          </View>
          <Text variant="caption" color="textMuted">Specialist areas: {creds?.skills.join(', ')}</Text>
          <Button label="Close" variant="secondary" onPress={() => setCreds(null)} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, paddingHorizontal: 4 },
  inst: { width: '48.5%', flexGrow: 1, gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  instIcon: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { marginTop: 'auto', marginBottom: 'auto', marginHorizontal: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm },
});
