/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { ContactQueryStatus } from '@hydra/shared';
import { flatten, useEnquiries } from '../../../api/queries';
import { BrandHeader } from '../../../components/layout';
import { Badge, Button, Card, EmptyState, FilterChips, SearchField, Text, colors, spacing } from '../../../design-system';
import { fmtRelative } from '../../../utils/format';
import { QueryFallback, notReady } from '../../../components/QueryState';

type F = 'ALL' | ContactQueryStatus;
const TONE = { NEW: 'primary', IN_PROGRESS: 'warning', CONVERTED: 'success', CLOSED: 'neutral' } as const;

/** Enquiry inbox (PDF Story 19). */
export default function EnquiriesTab() {
  const [status, setStatus] = useState<F>('NEW');
  const [search, setSearch] = useState('');
  const q = useEnquiries({ status: status === 'ALL' ? undefined : status, search: search.trim() || undefined });
  const items = flatten(q.data);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Enquiries" />
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search name, email, reference…" />
            <FilterChips value={status} onChange={setStatus} options={[{ value: 'NEW', label: 'New' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'CONVERTED', label: 'Converted' }, { value: 'CLOSED', label: 'Closed' }, { value: 'ALL', label: 'All' }]} />
            <Button label="Missed calls & auto-replies" icon="phone-missed" variant="secondary" size="sm" onPress={() => router.push('/admin/missed-calls')} />
          </View>
        }
        renderItem={({ item: e }) => (
          <Card onPress={() => router.push(`/admin/enquiry/${e.id}`)} accent={e.urgency === 'EMERGENCY' ? 'danger' : 'none'} accessibilityLabel={`Enquiry from ${e.name}`} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="mono" color="primaryBright">{e.reference}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {e.urgency !== 'STANDARD' ? <Badge label={e.urgency} tone={e.urgency === 'EMERGENCY' ? 'danger' : 'warning'} /> : null}
                <Badge label={e.status.replace('_', ' ')} tone={TONE[e.status]} />
              </View>
            </View>
            <Text variant="title" weight="bold">{e.name}</Text>
            <Text variant="bodySmall" color="textMuted" numberOfLines={2}>{e.message}</Text>
            <Text variant="caption" color="textMuted">{e.source.replace('_', ' ').toLowerCase()} · {e.sector ?? 'General'} · {fmtRelative(e.submittedAt)}</Text>
          </Card>
        )}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="inbox" title="Inbox clear" message="No enquiries in this view." />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}
