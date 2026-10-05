import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { flatten, useJobs } from '../../api/queries';
import { JobCard } from '../../components/jobs';
import { BrandHeader } from '../../components/layout';
import { Card, EmptyState, FilterChips, Icon, Text, colors, spacing } from '../../design-system';
import { QueryFallback, notReady } from '../../components/QueryState';

const FILTERS = {
  ACTIVE: 'SCHEDULED,IN_PROGRESS,INSPECTION_PENDING',
  DONE: 'COMPLETED,INVOICED,PARTIALLY_PAID,PAID',
} as const;

const HINTS: Record<string, string> = {
  materials: 'Open a job to log the materials you used — stock updates automatically.',
  inspection: 'Open a job to complete its inspection checklist and Certificate of Compliance.',
};

/** Every job assigned to the signed-in electrician (the API scopes /jobs to their assignments). */
export default function EmployeeJobs() {
  const params = useLocalSearchParams<{ filter?: string; focus?: string }>();
  const [filter, setFilter] = useState<keyof typeof FILTERS>(params.filter === 'DONE' ? 'DONE' : 'ACTIVE');
  const q = useJobs({ status: FILTERS[filter] });
  const items = flatten(q.data);
  const hint = params.focus ? HINTS[params.focus] : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Assigned Jobs" back />
      <FlatList
        data={items}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            {hint ? (
              <Card style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                <Icon name="info" size={16} color="primaryBright" />
                <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>{hint}</Text>
              </Card>
            ) : null}
            <FilterChips value={filter} onChange={setFilter} options={[{ value: 'ACTIVE', label: 'Scheduled & in progress' }, { value: 'DONE', label: 'Completed' }]} />
          </View>
        }
        renderItem={({ item }) => <JobCard job={item} showCustomer showElectrician={false} onPress={() => router.push(`/employee/job/${item.id}`)} />}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="briefcase" title="No jobs here" message="Jobs the office assigns to you appear here and in your calendar." />}
        onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}
