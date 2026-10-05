import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { LeaveRequestDto, LeaveStatus, TimesheetDto, TimesheetStatus } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { flatten, useEmployees, useLeave, useSimpleMutation, useTimesheets } from '../../../api/queries';
import { BrandHeader } from '../../../components/layout';
import { Badge, Button, Card, EmptyState, FilterChips, SearchField, Segmented, Text, TextField, colors, spacing, toast } from '../../../design-system';
import { ScheduleView } from '../../../features/ScheduleView';
import { fmtDate, fmtDateTime, fmtTime } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { QueryFallback, notReady } from '../../../components/QueryState';

type Tab = 'TEAM' | 'LEAVE' | 'TIMESHEETS' | 'SCHEDULE';
const TABS: Tab[] = ['TEAM', 'LEAVE', 'TIMESHEETS', 'SCHEDULE'];

/** Workforce (spec §10.8): employees, availability, leave approvals, timesheet review and schedules. */
export default function Workforce() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('TEAM');
  useSyncFrom(params.tab, (t) => {
    if ((TABS as string[]).includes(t)) setTab(t as Tab);
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Workforce" />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'TEAM', label: 'Team' }, { value: 'LEAVE', label: 'Leave' }, { value: 'TIMESHEETS', label: 'Timesheets' }, { value: 'SCHEDULE', label: 'Schedule' }]} />
      </View>
      {tab === 'TEAM' ? <Team /> : tab === 'LEAVE' ? <LeaveApprovals /> : tab === 'TIMESHEETS' ? <TimesheetReview /> : (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <Button label="Add calendar event" icon="plus" size="sm" style={{ flex: 1 }} onPress={() => router.push('/admin/schedule')} />
          </View>
          <ScheduleView jobRoute={(jobId) => `/admin/job/${jobId}`} showEmployee />
        </View>
      )}
    </View>
  );
}

function Team() {
  const [search, setSearch] = useState('');
  const q = useEmployees(search.trim() || undefined);
  const list = q.data ?? [];
  return (
    <FlatList
      data={list}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Payroll" icon="dollar-sign" size="sm" style={{ flex: 1 }} onPress={() => router.push('/admin/payroll')} />
            <Button label="Schedule" icon="calendar" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/admin/schedule')} />
          </View>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search electricians…" />
          {list.length ? (
            <Text variant="caption" color="textMuted">{list.filter((e) => e.clockedIn).length} clocked in · {list.filter((e) => e.onLeaveToday).length} on leave today · {list.length} total</Text>
          ) : null}
        </View>
      }
      renderItem={({ item: e }) => (
        <Card onPress={() => router.push(`/admin/employee/${e.id}`)} accessibilityLabel={`${e.firstName} ${e.lastName}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="title" weight="bold" style={{ flex: 1 }}>{e.firstName} {e.lastName}</Text>
            {!e.isActive ? <Badge label="INACTIVE" /> : e.onLeaveToday ? <Badge label="ON LEAVE" tone="warning" /> : e.clockedIn ? <Badge label="CLOCKED IN" tone="success" /> : <Badge label="OFF SHIFT" />}
          </View>
          <Text variant="caption" color="textMuted">{e.specialisation ?? 'Electrician'}{e.staffNumber ? ` · ${e.staffNumber}` : ''}</Text>
          <Text variant="caption" color="textSecondary">{e.activeJobCount} active job{e.activeJobCount === 1 ? '' : 's'}{e.phone ? ` · ${e.phone}` : ''}</Text>
        </Card>
      )}
      ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="users" title="No electricians" message="The owner can add staff under More → Staff accounts." />}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
    />
  );
}

function LeaveApprovals() {
  const [status, setStatus] = useState<LeaveStatus>('PENDING');
  const q = useLeave({ status });
  return (
    <FlatList
      data={flatten(q.data)}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
      ListHeaderComponent={<FilterChips value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'CANCELLED', label: 'Cancelled' }]} />}
      renderItem={({ item }) => <LeaveCard leave={item} />}
      ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="sun" title={status === 'PENDING' ? 'No leave awaiting approval' : 'Nothing here'} />}
      onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
    />
  );
}

function LeaveCard({ leave: l }: { leave: LeaveRequestDto }) {
  const [note, setNote] = useState('');
  const decide = useSimpleMutation((decision: 'APPROVE' | 'REJECT') => api.post<LeaveRequestDto>(`/leave-requests/${l.id}/decision`, { decision, note: note.trim() || undefined }), [['leave'], ['dashboard'], ['schedules'], ['employees'], ['availability']]);
  const run = (d: 'APPROVE' | 'REJECT') => decide.mutate(d, { onSuccess: () => toast.success(d === 'APPROVE' ? 'Leave approved — calendar updated' : 'Leave rejected'), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card style={{ gap: spacing.sm }} testID={`leave-${l.id}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title" weight="bold">{l.employeeName}</Text>
        <Badge label={l.status} tone={l.status === 'APPROVED' ? 'success' : l.status === 'PENDING' ? 'warning' : 'danger'} />
      </View>
      <Text variant="bodySmall">{l.leaveType.toLowerCase()} · {fmtDate(l.startDate)} – {fmtDate(l.endDate)} ({l.days} day{l.days === 1 ? '' : 's'})</Text>
      <Text variant="caption" color="textMuted">{l.reason}</Text>
      {l.decidedByName ? <Text variant="caption" color="textFaint">Decided by {l.decidedByName} · {fmtDateTime(l.decidedAt)}{l.decisionNote ? ` · ${l.decisionNote}` : ''}</Text> : null}
      {l.status === 'PENDING' ? (
        <>
          <TextField placeholder="Note to employee (optional)" value={note} onChangeText={setNote} maxLength={300} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Reject" variant="dangerOutline" size="sm" style={{ flex: 1 }} loading={decide.isPending && decide.variables === 'REJECT'} disabled={decide.isPending} onPress={() => run('REJECT')} />
            <Button label="Approve" size="sm" style={{ flex: 1 }} loading={decide.isPending && decide.variables === 'APPROVE'} disabled={decide.isPending} onPress={() => run('APPROVE')} testID={`approve-${l.id}`} />
          </View>
        </>
      ) : null}
    </Card>
  );
}

function TimesheetReview() {
  const [status, setStatus] = useState<TimesheetStatus>('SUBMITTED');
  const q = useTimesheets({ status });
  return (
    <FlatList
      data={flatten(q.data)}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <FilterChips value={status} onChange={setStatus} options={[{ value: 'SUBMITTED', label: 'To review' }, { value: 'OPEN', label: 'Open shifts' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'PAID', label: 'Paid' }]} />
          <Text variant="caption" color="textMuted">Only confirmed timesheets are included in payroll.</Text>
        </View>
      }
      renderItem={({ item }) => <TimesheetCard ts={item} />}
      ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="clock" title="No timesheets" />}
      onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
    />
  );
}

function TimesheetCard({ ts }: { ts: TimesheetDto }) {
  const [note, setNote] = useState('');
  const review = useSimpleMutation((decision: 'CONFIRM' | 'REJECT') => api.post<TimesheetDto>(`/timesheets/${ts.id}/review`, { decision, note: note.trim() || undefined }), [['timesheets'], ['dashboard']]);
  const reviewable = (ts.status === 'SUBMITTED' || ts.status === 'CONFIRMED') && !ts.payrollId;
  const run = (d: 'CONFIRM' | 'REJECT') => review.mutate(d, { onSuccess: () => toast.success(d === 'CONFIRM' ? 'Timesheet confirmed' : 'Timesheet rejected — employee notified'), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="title" weight="bold">{ts.employeeName}</Text>
        <Badge label={ts.status} tone={ts.status === 'CONFIRMED' || ts.status === 'PAID' ? 'success' : ts.status === 'REJECTED' ? 'danger' : ts.status === 'OPEN' ? 'primary' : 'warning'} />
      </View>
      <Text variant="bodySmall">{fmtDate(ts.workDate)} · {fmtTime(ts.clockIn)} – {ts.clockOut ? fmtTime(ts.clockOut) : 'on shift'}</Text>
      <Text variant="mono" color="primaryBright">{ts.totalHours !== null ? `${ts.totalHours.toFixed(2)} h` : '—'}{ts.jobReference ? `  ·  ${ts.jobReference}` : ''}</Text>
      {ts.notes ? <Text variant="caption" color="textMuted">{ts.notes}</Text> : null}
      {reviewable ? (
        <>
          <TextField placeholder="Review note (required to reject)" value={note} onChangeText={setNote} maxLength={300} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Reject" variant="dangerOutline" size="sm" style={{ flex: 1 }} disabled={review.isPending || note.trim().length < 3} onPress={() => run('REJECT')} />
            {ts.status === 'SUBMITTED' ? <Button label="Confirm" size="sm" style={{ flex: 1 }} loading={review.isPending} onPress={() => run('CONFIRM')} /> : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}
