/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { flatten, useJobs } from '../../../api/queries';
import { JobCard } from '../../../components/jobs';
import { BrandHeader } from '../../../components/layout';
import { Button, EmptyState, FilterChips, SearchField, colors, spacing } from '../../../design-system';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { QueryFallback, notReady } from '../../../components/QueryState';

const PIPELINE = {
  ALL: undefined,
  REQUESTED: 'REQUESTED',
  QUOTED: 'QUOTED,QUOTE_DECLINED',
  TO_ASSIGN: 'QUOTE_ACCEPTED',
  ACTIVE: 'SCHEDULED,IN_PROGRESS,INSPECTION_PENDING',
  TO_INVOICE: 'COMPLETED',
  BILLING: 'INVOICED,PARTIALLY_PAID',
  CLOSED: 'PAID,CANCELLED',
} as const;
type Stage = keyof typeof PIPELINE;

/** Job monitoring (spec §10.5) — pipeline stages mirror the lifecycle state machine. */
export default function AdminJobs() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [stage, setStage] = useState<Stage>('ALL');
  const [search, setSearch] = useState('');
  useSyncFrom(params.filter, (f) => {
    if (f in PIPELINE) setStage(f as Stage);
  });
  const q = useJobs({ status: PIPELINE[stage], search: search.trim() || undefined, sort: stage === 'ACTIVE' ? 'scheduled' : 'newest' });
  const items = flatten(q.data);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Jobs" />
      <FlatList
        data={items}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search reference, customer, address…" />
            <FilterChips
              value={stage}
              onChange={setStage}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'REQUESTED', label: 'Needs quote' },
                { value: 'QUOTED', label: 'Quoted' },
                { value: 'TO_ASSIGN', label: 'To assign' },
                { value: 'ACTIVE', label: 'In the field' },
                { value: 'TO_INVOICE', label: 'To invoice' },
                { value: 'BILLING', label: 'Awaiting payment' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Log job for customer" icon="plus" size="sm" style={{ flex: 1 }} onPress={() => router.push('/admin/new-job')} />
              <Button label="Schedule" icon="calendar" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/admin/schedule')} />
            </View>
          </View>
        }
        renderItem={({ item }) => <JobCard job={item} showCustomer onPress={() => router.push(`/admin/job/${item.id}`)} />}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="briefcase" title="No jobs at this stage" />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}
