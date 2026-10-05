/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAiSummary } from '../../../api/ai';
import { useAdminDashboard } from '../../../api/queries';
import { JobCard } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Card, EmptyState, Icon, Label, SectionHeader, Text, colors, radius, spacing, type ColorToken, type IconName } from '../../../design-system';
import { useAuth } from '../../../store/auth';
import { fmtRelative, money } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

interface Kpi {
  label: string;
  value: string;
  icon: IconName;
  color: ColorToken;
  route: string;
  alert?: boolean;
}

/** Owner-only modules (hidden from office admins; the API enforces ADMIN_OWNER on each). */
const OWNER_TOOLS: { label: string; icon: IconName; route: string }[] = [
  { label: 'Reports', icon: 'bar-chart-2', route: '/admin/reports' },
  { label: 'Data exports', icon: 'download', route: '/admin/exports' },
  { label: 'Audit log', icon: 'list', route: '/admin/audit' },
  { label: 'Staff accounts', icon: 'user-check', route: '/admin/staff' },
  { label: 'POPIA requests', icon: 'shield', route: '/admin/data-requests' },
  { label: 'Payroll approval', icon: 'dollar-sign', route: '/admin/payroll' },
  { label: 'AI Assistant settings', icon: 'cpu', route: '/admin/ai-settings' },
];

/** HYDRA Smart Quote review queue at a glance; severity 5 cases are shown in red at the top. */
function SmartQuoteCard() {
  const q = useAiSummary();
  const s = q.data;
  if (!s) return null;
  const critical = s.critical > 0;
  return (
    <Card accent={critical ? 'danger' : s.needsReview ? 'secondary' : 'none'} onPress={() => router.push(critical ? '/admin/ai-review?tab=URGENT' : '/admin/ai-review')} accessibilityLabel={`AI review: ${s.needsReview} need review, ${s.critical} critical`}
      style={{ gap: 6, backgroundColor: critical ? colors.dangerMuted : undefined }} testID="admin-ai-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={critical ? 'alert-octagon' : 'cpu'} color={critical ? 'dangerBright' : 'secondaryBright'} />
        <Text variant="title" weight="bold" color={critical ? 'dangerBright' : 'text'}>{critical ? `${s.critical} CRITICAL Smart Quote case${s.critical === 1 ? '' : 's'}` : 'Smart Quote AI review'}</Text>
      </View>
      <Text variant="caption" color="textMuted">{s.needsReview} need review · {s.urgent} urgent · {s.waitingCustomer} waiting on customer · {s.accepted} accepted to convert</Text>
    </Card>
  );
}

const ACTION_LABEL = (a: string) => a.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function AdminDashboard() {
  const q = useAdminDashboard();
  const role = useAuth((s) => s.user?.role);
  const d = q.data;
  const k = d?.kpis;
  const kpis: Kpi[] = k
    ? [
        { label: 'Active jobs', value: String(k.activeJobs), icon: 'activity', color: 'primaryBright', route: '/admin/jobs?filter=ACTIVE' },
        { label: 'New requests', value: String(k.requestedJobs), icon: 'plus-circle', color: 'warning', route: '/admin/jobs?filter=REQUESTED', alert: k.requestedJobs > 0 },
        { label: 'Quotes awaiting', value: String(k.quotesAwaiting), icon: 'file-text', color: 'secondaryBright', route: '/admin/jobs?filter=QUOTED' },
        { label: 'Invoices outstanding', value: `${k.invoicesOutstanding} · ${money(k.outstandingAmount)}`, icon: 'credit-card', color: 'warning', route: '/admin/invoices' },
        { label: 'Low stock items', value: String(k.lowStockCount), icon: 'package', color: k.lowStockCount ? 'dangerBright' : 'success', route: '/admin/inventory', alert: k.lowStockCount > 0 },
        { label: 'Staff clocked in', value: String(k.staffClockedIn), icon: 'clock', color: 'success', route: '/admin/workforce' },
        { label: 'Pending leave', value: String(k.pendingLeave), icon: 'sun', color: 'warning', route: '/admin/workforce?tab=LEAVE', alert: k.pendingLeave > 0 },
        { label: 'New enquiries', value: String(k.newEnquiries), icon: 'inbox', color: 'primaryBright', route: '/admin/enquiries', alert: k.newEnquiries > 0 },
        { label: 'Missed calls to review', value: String(k.missedCallsToReview), icon: 'phone-missed', color: k.missedCallsToReview ? 'dangerBright' : 'textSecondary', route: '/admin/missed-calls', alert: k.missedCallsToReview > 0 },
        { label: 'Revenue this month', value: money(k.revenueThisMonth), icon: 'trending-up', color: 'success', route: role === 'ADMIN_OWNER' ? '/admin/reports' : '/admin/invoices' },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Operations Center" />
      <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!d ? <QueryFallback query={q} count={4} /> : (
          <>
            <View>
              <Label color="primaryBright">{role === 'ADMIN_OWNER' ? 'Owner / Manager' : 'Office admin'}</Label>
              <Text variant="h1">Operations Center</Text>
            </View>
            <SmartQuoteCard />
            <View style={styles.grid}>
              {kpis.map((x) => (
                <Card key={x.label} style={styles.kpi} onPress={() => router.push(x.route as never)} accessibilityLabel={`${x.label}: ${x.value}`} accent={x.alert ? 'primary' : 'none'}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Icon name={x.icon} size={18} color={x.color} />
                    {x.alert ? <View style={styles.alert} /> : null}
                  </View>
                  <Text variant="h2" color={x.color} numberOfLines={1} adjustsFontSizeToFit>{x.value}</Text>
                  <Text variant="caption" color="textMuted">{x.label}</Text>
                </Card>
              ))}
            </View>

            {role === 'ADMIN_OWNER' ? (
              <Card accent="secondary" style={{ gap: spacing.md }} testID="owner-tools">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="key" size={16} color="secondaryBright" />
                  <Text variant="title" weight="bold" style={{ flex: 1 }}>Owner tools</Text>
                </View>
                <View style={styles.ownerGrid}>
                  {OWNER_TOOLS.map((t) => (
                    <Pressable key={t.route} accessibilityRole="button" accessibilityLabel={t.label} onPress={() => router.push(t.route as never)} style={({ pressed }) => [styles.ownerTool, pressed ? { opacity: 0.85 } : null]}>
                      <Icon name={t.icon} size={16} color="secondaryBright" />
                      <Text variant="caption" weight="semibold" style={{ flex: 1 }}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            ) : null}

            <SectionHeader title="Urgent / emergency" icon="alert-octagon" />
            {d.urgentJobs.length === 0 ? <Text variant="bodySmall" color="textMuted">No open emergency jobs.</Text> : d.urgentJobs.map((j) => (
              <JobCard key={j.id} job={j} showCustomer onPress={() => router.push(`/admin/job/${j.id}`)} />
            ))}

            <SectionHeader title="Active field jobs" icon="map" actionLabel="All jobs" onAction={() => router.navigate('/admin/jobs')} />
            {d.activeJobs.length === 0 ? <EmptyState icon="map" title="No jobs in the field" /> : d.activeJobs.map((j) => (
              <JobCard key={j.id} job={j} showCustomer onPress={() => router.push(`/admin/job/${j.id}`)} />
            ))}

            <SectionHeader title="Recent activity" icon="list" actionLabel={role === 'ADMIN_OWNER' ? 'Audit log' : undefined} onAction={role === 'ADMIN_OWNER' ? () => router.push('/admin/audit') : undefined} />
            <Card style={{ gap: 2 }}>
              {d.recentActivity.map((a) => (
                <View key={a.id} style={styles.activity}>
                  <View style={styles.activityDot} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" weight="semibold">{ACTION_LABEL(a.action)}</Text>
                    <Text variant="caption" color="textMuted">{a.actorName ?? 'System'} · {a.entityType}</Text>
                  </View>
                  <Text variant="caption" color="textMuted">{fmtRelative(a.createdAt)}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpi: { width: '47.5%', flexGrow: 1, gap: 6, minHeight: 104 },
  ownerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ownerTool: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.secondaryBorder, backgroundColor: colors.secondaryMuted },
  alert: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dangerBright },
  activity: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  activityDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primaryBright },
});
