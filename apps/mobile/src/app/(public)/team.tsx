/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { TeamCategory, TeamMemberDto } from '@hydra/shared';
import { useTeam } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { TeamCard, published } from '../../components/marketing';
import { PSG_CONTACT } from '../../content/company';
import { Button, Card, EmptyState, FilterChips, KeyValue, LoadingCards, SearchField, Text, colors, radius, spacing } from '../../design-system';
import { callNumber } from '../../utils/links';

type Filter = 'ALL' | TeamCategory;

/** Team profiles. Only published (non-demo) members appear; credentials come from their records. */
export default function TeamScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [creds, setCreds] = useState<TeamMemberDto | null>(null);
  const team = useTeam({ category: filter === 'ALL' ? undefined : filter, search: search.trim() || undefined });
  const members = published(team.data);
  const filtering = filter !== 'ALL' || !!search.trim();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Meet the Team" back />
      <Screen withTabBar={false} onRefresh={() => void team.refetch()} refreshing={team.isRefetching}>
        <Card style={{ gap: spacing.md }}>
          <Text variant="h1">Our team</Text>
          <Text variant="body" color="textMuted">
            Our team is experienced in executing projects within live operational facilities, completing work efficiently while minimising disruption to ongoing operations.
          </Text>
        </Card>
        {members.length || filtering ? (
          <>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search by name or skill" />
            <FilterChips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'ALL', label: 'All team' },
                { value: 'ENGINEERING', label: 'Engineering' },
                { value: 'TECHNICIANS', label: 'Technicians' },
                { value: 'MANAGEMENT', label: 'Management' },
                { value: 'COMPLIANCE', label: 'Compliance' },
              ]}
            />
          </>
        ) : null}
        {team.isLoading ? (
          <LoadingCards />
        ) : !members.length ? (
          filtering ? (
            <EmptyState icon="users" title="No team members found" message="Try another search." />
          ) : (
            <EmptyState icon="users" title="Team profiles coming soon" message="Individual profiles will be published here once confirmed by PSG Electrical & Cables." />
          )
        ) : (
          members.map((m) => <TeamCard key={m.id} member={m} onCredentials={() => setCreds(m)} onCall={() => void callNumber(PSG_CONTACT.primaryPhone)} />)
        )}

        <Card accent="primary" style={{ gap: spacing.md }}>
          <Text variant="h2">Need help with a project?</Text>
          <Text variant="bodySmall" color="textMuted">Tell us what you need and we will match the right people to the work.</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Request a quote" icon="file-text" style={{ flex: 1 }} onPress={() => router.navigate('/quote')} />
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { marginTop: 'auto', marginBottom: 'auto', marginHorizontal: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm },
});
