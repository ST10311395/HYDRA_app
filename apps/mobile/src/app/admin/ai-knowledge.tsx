import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { AiKnowledgeStatus } from '@hydra/shared';
import { useKnowledge } from '../../api/ai';
import { flatten } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Button, Card, FilterChips, SearchField, Text, spacing } from '../../design-system';
import { SeverityPill } from '../../features/ai/components';
import { fmtDate } from '../../utils/format';

type Filter = 'ALL' | AiKnowledgeStatus;

/** Admin → More → AI Knowledge: the approved answers the assistant retrieves (it never trains itself). */
export default function AiKnowledgeList() {
  const [status, setStatus] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const q = useKnowledge({ ...(status === 'ALL' ? {} : { status }), search });
  return (
    <AdminList
      section="AI Knowledge"
      query={q}
      items={flatten(q.data)}
      emptyIcon="book-open"
      emptyTitle="No knowledge entries"
      emptyMessage="Approve a resolved AI case as knowledge, or add an entry."
      header={
        <>
          <Text variant="bodySmall" color="textMuted">Smart Quote “learns” only from entries approved here. Pending, inactive and archived entries are never used.</Text>
          <FilterChips options={[{ value: 'ALL', label: 'Current' }, { value: 'APPROVED', label: 'Approved' }, { value: 'PENDING', label: 'Pending approval' }, { value: 'ARCHIVED', label: 'Archived' }]} value={status} onChange={setStatus} />
          <SearchField value={search} onChangeText={setSearch} placeholder="Search title, problem or keyword" />
          <Button label="New entry" icon="plus" variant="secondary" fullWidth={false} onPress={() => router.push('/admin/ai-entry/new')} />
        </>
      }
      renderItem={({ item: k }) => (
        <Card onPress={() => router.push(`/admin/ai-entry/${k.id}`)} accessibilityLabel={`Knowledge ${k.title}`} style={{ gap: 6 }}>
          <Text variant="title" weight="bold">{k.title}</Text>
          <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>{k.problemSummary}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Badge label={k.status} tone={k.status === 'APPROVED' ? 'success' : k.status === 'PENDING' ? 'warning' : 'neutral'} />
            <Badge label={k.active ? 'ACTIVE' : 'INACTIVE'} tone={k.active ? 'primary' : 'neutral'} />
            <Badge label={k.serviceCategory} tone="neutral" />
            <SeverityPill severity={k.severity} />
            <Badge label={`v${k.version}`} tone="neutral" />
          </View>
          <Text variant="caption" color="textMuted">
            {k.approvedByName ? `Approved by ${k.approvedByName} · ${fmtDate(k.approvedAt)}` : 'Awaiting approval'} · used {k.timesRetrieved}×{k.sourceReference ? ` · from ${k.sourceReference}` : ''}
          </Text>
        </Card>
      )}
    />
  );
}
