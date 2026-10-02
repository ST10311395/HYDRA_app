import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useCustomerDashboard } from '../../../api/queries';
import { JobStatusBadge } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { QuickLinks } from '../../../components/QuickLinks';
import { Badge, Button, Card, Icon, IconTile, Label, ProgressBar, SectionHeader, Text, colors, radius, spacing, type IconName } from '../../../design-system';
import { fmtDate, fmtDateTime, fmtRelative, money, tierProgress } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

const TIPS = [
  'Test your earth-leakage unit monthly using its test button.',
  'Never overload multiplugs — heaters and kettles need their own socket.',
  'A warm or buzzing distribution board needs an electrician’s inspection.',
  'Keep your Certificate of Compliance — it’s required when you sell your property.',
];

export default function CustomerDashboard() {
  const q = useCustomerDashboard();
  const d = q.data;
  if (d && !d.onboardingCompleted) return <Redirect href="/customer/onboarding" />;
  const active = d?.activeJob;
  const tip = TIPS[new Date().getDate() % TIPS.length];

  const actions: { icon: IconName; label: string; onPress: () => void; tone?: 'primary' | 'secondary' | 'danger' }[] = [
    { icon: 'plus-circle', label: 'Request service', onPress: () => router.push('/customer/request'), tone: 'primary' },
    { icon: 'activity', label: 'Track job', onPress: () => (active ? router.push(`/customer/job/${active.id}`) : router.navigate('/customer/jobs')) },
    { icon: 'maximize', label: 'Show QR', onPress: () => {
      const scheduled = d?.activeJobs.find((j) => j.status === 'SCHEDULED');
      if (scheduled) router.push(`/customer/qr/${scheduled.id}`);
      else router.navigate('/customer/jobs');
    }, tone: 'secondary' },
    { icon: 'credit-card', label: 'Pay invoice', onPress: () => (d?.invoicesDue[0] ? router.push(`/customer/invoice/${d.invoicesDue[0].id}`) : router.navigate('/customer/billing')) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="My Dashboard" />
      <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!d ? <QueryFallback query={q} count={3} /> : (
          <>
            <View>
              <Label color="primaryBright">Customer portal</Label>
              <Text variant="h1">Hello, {d.firstName}</Text>
            </View>

            <Card accent="secondary" style={{ gap: spacing.md, backgroundColor: '#18152A' }} onPress={() => router.navigate('/customer/rewards')} accessibilityLabel="Rewards balance">
              <View style={styles.between}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="gift" size={18} color="secondaryBright" /><Text variant="title" weight="bold">Rewards balance</Text></View>
                <Badge label={d.rewards.tier} tone="secondary" />
              </View>
              <Text variant="stat" color="secondaryBright">{d.rewards.pointsBalance.toLocaleString('en-ZA')} <Text variant="title" color="textMuted">pts</Text></Text>
              {d.rewards.nextTier ? (
                <>
                  <ProgressBar tone="secondary" value={tierProgress(d.rewards)} />
                  <Text variant="caption" color="textMuted">{d.rewards.pointsToNextTier} lifetime points to {d.rewards.nextTier}</Text>
                </>
              ) : null}
            </Card>

            {active ? (
              <Card accent="primary" onPress={() => router.push(`/customer/job/${active.id}`)} accessibilityLabel={`Active job ${active.reference}`} style={{ gap: spacing.sm }}>
                <View style={styles.between}>
                  <Label color="primaryBright">Active job · {active.reference}</Label>
                  <JobStatusBadge status={active.status} />
                </View>
                <Text variant="h3">{active.serviceType.name}</Text>
                <Text variant="bodySmall" color="textMuted" numberOfLines={2}>{active.siteAddress}</Text>
                {active.nextMilestone ? (
                  <View style={styles.inset}><Icon name="flag" size={14} color="primaryBright" /><Text variant="bodySmall">Next milestone: <Text variant="bodySmall" weight="bold">{active.nextMilestone}</Text></Text></View>
                ) : null}
                {active.electrician ? <Text variant="bodySmall" color="textSecondary">⚡ {active.electrician.name}{active.scheduledStart ? ` · ${fmtDateTime(active.scheduledStart)}` : ''}</Text> : null}
              </Card>
            ) : (
              <Card style={{ gap: spacing.md, alignItems: 'flex-start' }}>
                <Text variant="title" weight="bold">No active jobs</Text>
                <Text variant="bodySmall" color="textMuted">Need an electrician or a Certificate of Compliance? Request a service in under a minute.</Text>
                <Button label="Request a service" icon="plus" fullWidth={false} onPress={() => router.push('/customer/request')} />
              </Card>
            )}

            <View style={styles.actions}>
              {actions.map((a) => (
                <Card key={a.label} style={styles.action} onPress={a.onPress} accessibilityLabel={a.label}>
                  <IconTile icon={a.icon} tone={a.tone ?? 'neutral'} />
                  <Text variant="title" weight="bold">{a.label}</Text>
                </Card>
              ))}
            </View>

            {d.quotesAwaiting.length ? (
              <>
                <SectionHeader title="Quotes awaiting you" icon="file-text" />
                {d.quotesAwaiting.map((qt) => (
                  <Card key={qt.id} onPress={() => router.push(`/customer/quote/${qt.id}`)} accent="primary" accessibilityLabel={`Quote for ${qt.jobReference}`}>
                    <View style={styles.between}>
                      <View>
                        <Text variant="mono" color="primaryBright">{qt.jobReference}</Text>
                        <Text variant="caption" color="textMuted">Valid until {fmtDate(qt.validUntil)}</Text>
                      </View>
                      <Text variant="h3">{money(qt.total)}</Text>
                      <Icon name="chevron-right" color="textMuted" />
                    </View>
                  </Card>
                ))}
              </>
            ) : null}

            {d.invoicesDue.length ? (
              <>
                <SectionHeader title="Invoices due" icon="credit-card" />
                {d.invoicesDue.map((inv) => (
                  <Card key={inv.id} onPress={() => router.push(`/customer/invoice/${inv.id}`)} accent={inv.status === 'OVERDUE' ? 'danger' : 'none'} accessibilityLabel={`Invoice ${inv.number}`}>
                    <View style={styles.between}>
                      <View>
                        <Text variant="mono">{inv.number}</Text>
                        <Text variant="caption" color={inv.status === 'OVERDUE' ? 'dangerBright' : 'textMuted'}>{inv.status === 'OVERDUE' ? 'Overdue' : `Due ${fmtDate(inv.dueDate)}`}</Text>
                      </View>
                      <Text variant="h3" color="warning">{money(inv.amountDue)}</Text>
                    </View>
                  </Card>
                ))}
              </>
            ) : null}

            <SectionHeader title="Recent updates" icon="bell" actionLabel="All" onAction={() => router.push('/customer/notifications')} />
            {d.recentNotifications.length === 0 ? <Text variant="bodySmall" color="textMuted">You’re all caught up.</Text> : d.recentNotifications.map((n) => (
              <View key={n.id} style={styles.notif}>
                <View style={[styles.dot, { backgroundColor: n.readAt ? colors.border : colors.primaryBright }]} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" weight="bold">{n.title}</Text>
                  <Text variant="caption" color="textMuted" numberOfLines={2}>{n.body}</Text>
                </View>
                <Text variant="caption" color="textMuted">{fmtRelative(n.createdAt)}</Text>
              </View>
            ))}

            <Card style={{ flexDirection: 'row', gap: spacing.md }}>
              <IconTile icon="shield" tone="secondary" />
              <View style={{ flex: 1 }}>
                <Label color="secondaryBright">Safety tip</Label>
                <Text variant="bodySmall" color="textSecondary">{tip}</Text>
              </View>
            </Card>

            <SectionHeader title="Everything in your account" icon="grid" />
            <QuickLinks links={[
              { icon: 'briefcase', label: 'My jobs', route: '/customer/jobs' },
              { icon: 'plus-circle', label: 'Request service', route: '/customer/request' },
              { icon: 'file-text', label: 'Quotes', route: '/customer/jobs?filter=QUOTES', badge: d.quotesAwaiting.length ? String(d.quotesAwaiting.length) : undefined },
              { icon: 'activity', label: 'Live job timeline', route: active ? `/customer/job/${active.id}` : '/customer/jobs' },
              { icon: 'credit-card', label: 'Invoices & payments', route: '/customer/billing', badge: d.invoicesDue.length ? String(d.invoicesDue.length) : undefined },
              { icon: 'gift', label: 'Rewards', route: '/customer/rewards' },
              { icon: 'award', label: 'Compliance reports', route: '/customer/jobs?filter=CERTIFICATES' },
              { icon: 'bell', label: 'Notifications', route: '/customer/notifications' },
              { icon: 'settings', label: 'Profile & settings', route: '/customer/profile' },
            ]} />

            <SectionHeader title="Explore PSG Electrical" icon="compass" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {([['Services', '/services'], ['Recent Work', '/work'], ['Why PSG', '/why-psg'], ['Our Team', '/team'], ['Partners', '/partners'], ['Contact', '/contact']] as const).map(([l, h]) => (
                <Button key={l} label={l} variant="outline" size="sm" fullWidth={false} onPress={() => router.push(h)} />
              ))}
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  inset: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.surfaceInset, borderRadius: radius.sm, padding: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: { width: '47.5%', flexGrow: 1, gap: spacing.md, minHeight: 110 },
  notif: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
