import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { api, errorMessage } from '../../../api/client';
import { flatten, useCustomer, useInvoices, useJobs, useSimpleMutation } from '../../../api/queries';
import { useIsOwner } from '../../../components/admin';
import { JobCard, SegmentLink } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, KeyValue, Label, Text, colors, confirm, spacing, toast } from '../../../design-system';
import { fmtDate, money } from '../../../utils/format';
import { callNumber, sendEmail } from '../../../utils/links';
import { QueryFallback } from '../../../components/QueryState';

/** Customer record for office staff: contact, jobs, invoices, balance and (owner) account status. */
export default function AdminCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const owner = useIsOwner();
  const q = useCustomer(id);
  const c = q.data;
  const jobs = useJobs({ customerId: id });
  const invoices = useInvoices({ customerId: id });
  const status = useSimpleMutation((next: 'ACTIVE' | 'DISABLED') => api.patch<{ status: string }>(`/users/${c!.userId}/status`, { status: next, reason: 'Changed by owner in admin app' }), [['customer', id], ['customers']]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={c ? `${c.firstName} ${c.lastName}` : 'Customer'} back />
      <Screen withTabBar={false} onRefresh={() => { void q.refetch(); void jobs.refetch(); void invoices.refetch(); }} refreshing={q.isRefetching}>
        {!c ? <QueryFallback query={q} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="h2">{c.firstName} {c.lastName}</Text>
                <Badge label={c.status} tone={c.status === 'ACTIVE' ? 'success' : 'danger'} />
              </View>
              <KeyValue label="Email" value={c.email} />
              <KeyValue label="Phone" value={c.phone ?? '—'} />
              <KeyValue label="Address" value={c.address ?? '—'} />
              <KeyValue label="Customer since" value={fmtDate(c.createdAt)} />
              <KeyValue label="Outstanding" value={money(c.outstandingBalance)} valueColor={c.outstandingBalance > 0 ? 'warning' : 'success'} mono />
              <KeyValue label="Reward points" value={String(c.pointsBalance)} mono />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {c.phone ? <Button label="Call" icon="phone" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void callNumber(c.phone!)} /> : null}
                <Button label="Email" icon="mail" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void sendEmail(c.email)} />
              </View>
              <Button label="Log a job for this customer" icon="plus-circle" size="sm" onPress={() => router.push(`/admin/new-job?customerId=${c.id}`)} />
            </Card>

            <Label>Jobs ({c.jobCount})</Label>
            {flatten(jobs.data).length === 0 ? <Text variant="bodySmall" color="textMuted">No jobs yet.</Text> : flatten(jobs.data).map((j) => (
              <JobCard key={j.id} job={j} onPress={() => router.push(`/admin/job/${j.id}`)} />
            ))}
            {jobs.hasNextPage ? <Button label="Load more jobs" variant="ghost" size="sm" onPress={() => void jobs.fetchNextPage()} /> : null}

            <Label>Invoices</Label>
            {flatten(invoices.data).length === 0 ? <Text variant="bodySmall" color="textMuted">No invoices.</Text> : flatten(invoices.data).map((i) => (
              <SegmentLink key={i.id} icon="file-text" label={`${i.number} · ${money(i.total)} · ${i.status.replace('_', ' ').toLowerCase()}`} badge={i.amountDue > 0 && i.status === 'OVERDUE' ? 'OVERDUE' : undefined} onPress={() => router.push(`/admin/invoice/${i.id}`)} />
            ))}

            {owner ? (
              <Button
                label={c.status === 'ACTIVE' ? 'Disable account' : 'Re-enable account'}
                icon={c.status === 'ACTIVE' ? 'user-x' : 'user-check'}
                variant={c.status === 'ACTIVE' ? 'dangerOutline' : 'secondary'}
                loading={status.isPending}
                onPress={() => void (async () => {
                  const next = c.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
                  if (next === 'DISABLED' && !(await confirm({ title: 'Disable this account?', message: 'The customer is signed out everywhere and cannot sign in. Their records are retained.', confirmLabel: 'Disable', destructive: true }))) return;
                  status.mutate(next, { onSuccess: () => toast.success(next === 'DISABLED' ? 'Account disabled' : 'Account re-enabled'), onError: (e) => toast.error(errorMessage(e)) });
                })()}
              />
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
