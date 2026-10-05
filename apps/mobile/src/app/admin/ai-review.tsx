/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AI_ESCALATION_REASON_LABELS, type AiQueueTab } from '@hydra/shared';
import { useAiQueue, useAiSummary } from '../../api/ai';
import { flatten } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Button, Card, FilterChips, Icon, SearchField, Text, colors, radius, spacing } from '../../design-system';
import { SeverityPill } from '../../features/ai/components';
import { money } from '../../utils/format';

const TABS: { value: AiQueueTab; label: string }[] = [
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'WAITING_CUSTOMER', label: 'Waiting customer' },
  { value: 'RESPONDED', label: 'Responded' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'CLOSED', label: 'Closed' },
];

const age = (m: number) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`);

/** Admin → AI Review: escalated and in-flight Smart Quote cases, most dangerous first. */
export default function AiReviewQueue() {
  const params = useLocalSearchParams<{ tab?: AiQueueTab }>();
  const [tab, setTab] = useState<AiQueueTab>(params.tab ?? 'NEEDS_REVIEW');
  const [search, setSearch] = useState('');
  const q = useAiQueue(tab, search);
  const summary = useAiSummary();
  const s = summary.data;

  return (
    <AdminList
      section="AI Review"
      query={q}
      items={flatten(q.data)}
      emptyIcon="check-circle"
      emptyTitle="Nothing here"
      emptyMessage="No Smart Quote cases match this filter."
      header={
        <>
          {s && s.critical > 0 ? (
            <Card accent="danger" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.dangerMuted }} onPress={() => setTab('URGENT')} accessibilityLabel={`${s.critical} critical cases`}>
              <Icon name="alert-octagon" color="dangerBright" />
              <Text variant="title" weight="bold" color="dangerBright">{s.critical} CRITICAL (severity 5) case{s.critical === 1 ? '' : 's'} open</Text>
            </Card>
          ) : null}
          <FilterChips options={TABS.map((t) => ({ ...t, label: t.value === 'NEEDS_REVIEW' && s?.needsReview ? `${t.label} (${s.needsReview})` : t.value === 'URGENT' && s?.urgent ? `${t.label} (${s.urgent})` : t.label }))} value={tab} onChange={setTab} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Search reference, customer or problem" />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="AI Knowledge" icon="book-open" variant="secondary" size="sm" fullWidth={false} onPress={() => router.push('/admin/ai-knowledge')} />
            <Button label="Analytics" icon="bar-chart-2" variant="secondary" size="sm" fullWidth={false} onPress={() => router.push('/admin/ai-analytics')} />
          </View>
        </>
      }
      renderItem={({ item: c }) => (
        <Card onPress={() => router.push(`/admin/ai-case/${c.id}`)} accent={c.severity === 5 ? 'danger' : c.reviewRequired ? 'secondary' : 'none'} accessibilityLabel={`AI case ${c.reference}`} style={{ gap: 6 }} testID={`ai-case-${c.id}`}>
          <View style={styles.between}>
            <Text variant="mono" color="primaryBright">{c.reference}</Text>
            <Text variant="caption" color="textMuted">{age(c.ageMinutes)} ago</Text>
          </View>
          <Text variant="title" weight="bold">{c.customerName}</Text>
          <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>{c.firstMessage}</Text>
          {c.thumbnails.length ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {c.thumbnails.map((u) => <Image key={u} source={{ uri: u }} style={styles.thumb} contentFit="cover" accessibilityLabel="Customer photo" />)}
            </View>
          ) : null}
          <View style={styles.badges}>
            {c.severity ? <SeverityPill severity={c.severity} /> : null}
            <Badge label={c.statusLabel} tone="neutral" mono={false} />
            {c.serviceCategoryLabel ? <Badge label={c.serviceCategoryLabel} tone="primary" mono={false} /> : null}
            {c.confidence !== null ? <Badge label={`${c.confidence}% conf.`} tone={c.confidence >= 80 ? 'success' : c.confidence >= 60 ? 'warning' : 'danger'} /> : null}
            {c.humanRequested ? <Badge label="Asked for a person" tone="secondary" icon="user" mono={false} /> : null}
            {c.isSimulation ? <Badge label="Simulation" tone="secondary" mono={false} /> : null}
          </View>
          {c.estimateMin !== null && c.estimateMax !== null ? <Text variant="bodySmall">Estimate {money(c.estimateMin)} – {money(c.estimateMax)}</Text> : null}
          {c.escalationReasons.length ? <Text variant="caption" color="warning">⚑ {c.escalationReasons.map((r) => AI_ESCALATION_REASON_LABELS[r]).join(' · ')}</Text> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm },
});
