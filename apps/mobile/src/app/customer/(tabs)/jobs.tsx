import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { flatten, useJobs } from '../../../api/queries';
import { JobCard } from '../../../components/jobs';
import { BrandHeader } from '../../../components/layout';
import { Button, EmptyState, FilterChips, Text, colors, spacing } from '../../../design-system';
import { QueryFallback, notReady } from '../../../components/QueryState';

const FILTERS = {
  ACTIVE: 'REQUESTED,QUOTED,QUOTE_ACCEPTED,QUOTE_DECLINED,SCHEDULED,IN_PROGRESS,INSPECTION_PENDING,COMPLETED,INVOICED,PARTIALLY_PAID',
  QUOTES: 'QUOTED',
  // Inspection passed → a Certificate of Compliance exists on the job.
  CERTIFICATES: 'COMPLETED,INVOICED,PARTIALLY_PAID,PAID',
  DONE: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;

export default function CustomerJobs() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<keyof typeof FILTERS>(params.filter && params.filter in FILTERS ? (params.filter as keyof typeof FILTERS) : 'ACTIVE');
  const q = useJobs({ status: FILTERS[filter] });
  const items = flatten(q.data);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="My Jobs" />
      <FlatList
        data={items}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Button label="Request a new service" icon="plus" onPress={() => router.push('/customer/request')} />
            <FilterChips value={filter} onChange={setFilter} options={[{ value: 'ACTIVE', label: 'Current' }, { value: 'QUOTES', label: 'Quotes to review' }, { value: 'CERTIFICATES', label: 'Compliance (CoC)' }, { value: 'DONE', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          </View>
        }
        renderItem={({ item }) => <JobCard job={item} onPress={() => router.push(`/customer/job/${item.id}`)} />}
        ListFooterComponent={filter === 'CERTIFICATES' && items.length ? <Text variant="caption" color="textMuted" align="center">Open a job to view or share its Certificate of Compliance.</Text> : null}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="briefcase" title="No jobs here yet" message="Requests you make will appear here with live progress." />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}
