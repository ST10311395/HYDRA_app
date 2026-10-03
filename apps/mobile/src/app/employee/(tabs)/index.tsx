import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useEmployeeToday } from '../../../api/queries';
import { JobCard } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { QuickLinks } from '../../../components/QuickLinks';
import { Badge, Button, Card, EmptyState, Icon, Label, SectionHeader, Text, colors, spacing } from '../../../design-system';
import { ShiftCard } from '../../../features/ShiftCard';
import { fmtDate, fmtRelative, fmtTime } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

export default function EmployeeToday() {
  const q = useEmployeeToday();
  const d = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Today" />
      <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!d ? <QueryFallback query={q} count={3} /> : (
          <>
            <View style={styles.between}>
              <View>
                <Label color="primaryBright">{fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</Label>
                <Text variant="h1">Hi {d.employee.name.split(' ')[0]}</Text>
              </View>
              {d.employee.staffNumber ? <Badge label={d.employee.staffNumber} tone="neutral" /> : null}
            </View>

            <ShiftCard openShift={d.openShift} todayHours={d.todayHours} />

            {d.nextJob ? (
              <Card accent="primary" style={{ gap: spacing.md }} onPress={() => router.push(`/employee/job/${d.nextJob!.id}`)} accessibilityLabel="Next job">
                <View style={styles.between}>
                  <Label color="primaryBright">Next job · {d.nextJob.reference}</Label>
                  <Text variant="mono" color="primaryBright">
                    {d.nextJob.scheduledStart
                      ? new Date(d.nextJob.scheduledStart).toDateString() === new Date().toDateString() ? fmtTime(d.nextJob.scheduledStart) : `${fmtDate(d.nextJob.scheduledStart, { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(d.nextJob.scheduledStart)}`
                      : ''}
                  </Text>
                </View>
                <Text variant="h3">{d.nextJob.serviceType.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="map-pin" size={14} color="textMuted" /><Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>{d.nextJob.siteAddress}</Text></View>
                <Text variant="bodySmall" color="textSecondary">Customer: {d.nextJob.customer.name}</Text>
                <Button label="Scan customer QR on arrival" icon="maximize" onPress={() => router.navigate('/employee/scan')} />
              </Card>
            ) : null}

            {d.pendingTasks.length ? (
              <Card style={{ gap: spacing.sm }}>
                <Label color="warning">Pending tasks</Label>
                {d.pendingTasks.map((t) => (
                  <Button key={t.jobId} label={`${t.jobReference}: ${t.task}`} variant="secondary" size="sm" icon="alert-circle" onPress={() => router.push(`/employee/job/${t.jobId}`)} />
                ))}
              </Card>
            ) : null}

            <SectionHeader title="Today’s jobs" icon="briefcase" />
            {d.todaysJobs.length === 0 ? (
              <EmptyState
                icon="coffee"
                title="No jobs scheduled today"
                message={d.assignedOpenJobs > 0
                  ? `You have ${d.assignedOpenJobs} assigned job${d.assignedOpenJobs === 1 ? '' : 's'} on other days.`
                  : 'You have no assigned jobs right now. New assignments will appear here and in your calendar.'}
                action={d.assignedOpenJobs > 0 ? <Button label={`View assigned jobs (${d.assignedOpenJobs})`} variant="secondary" fullWidth={false} onPress={() => router.push('/employee/jobs')} /> : undefined}
              />
            ) : d.todaysJobs.map((j) => (
              <JobCard key={j.id} job={j} showCustomer showElectrician={false} onPress={() => router.push(`/employee/job/${j.id}`)} />
            ))}

            {d.upcomingJobs.length ? (
              <>
                <SectionHeader title="Next few days" icon="calendar" actionLabel="Calendar" onAction={() => router.navigate('/employee/calendar')} />
                {d.upcomingJobs.map((j) => <JobCard key={j.id} job={j} showCustomer showElectrician={false} onPress={() => router.push(`/employee/job/${j.id}`)} />)}
              </>
            ) : null}

            {d.pendingLeave.length ? (
              <Card onPress={() => router.push('/employee/leave')} style={{ gap: 4 }} accessibilityLabel="Leave requests">
                <Label>Leave</Label>
                {d.pendingLeave.map((l) => <Text key={l.id} variant="bodySmall">{fmtDate(l.startDate)} → {fmtDate(l.endDate)} · <Text variant="bodySmall" color="warning">awaiting approval</Text></Text>)}
              </Card>
            ) : null}

            <SectionHeader title="My workspace" icon="grid" />
            <QuickLinks links={[
              { icon: 'briefcase', label: 'Assigned jobs', route: '/employee/jobs' },
              { icon: 'calendar', label: 'Calendar', route: '/employee/calendar' },
              { icon: 'maximize', label: 'Scan QR', route: '/employee/scan' },
              { icon: 'clock', label: d.openShift ? 'Clock out' : 'Clock in', route: '/employee/timesheet' },
              { icon: 'file-text', label: 'Timesheets', route: '/employee/timesheet' },
              { icon: 'package', label: 'Materials', route: '/employee/jobs?focus=materials' },
              { icon: 'award', label: 'Inspection / CoC', route: '/employee/jobs?focus=inspection' },
              { icon: 'sun', label: 'Leave requests', route: '/employee/leave' },
              { icon: 'bell', label: 'Notifications', route: '/employee/notifications' },
              { icon: 'settings', label: 'Profile & settings', route: '/employee/profile' },
            ]} />

            <SectionHeader title="Recent updates" icon="bell" actionLabel="All" onAction={() => router.push('/employee/notifications')} />
            {d.recentNotifications.map((n) => (
              <View key={n.id} style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={[styles.dot, { backgroundColor: n.readAt ? colors.border : colors.primaryBright }]} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" weight="bold">{n.title}</Text>
                  <Text variant="caption" color="textMuted">{n.body}</Text>
                </View>
                <Text variant="caption" color="textMuted">{fmtRelative(n.createdAt)}</Text>
              </View>
            ))}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
