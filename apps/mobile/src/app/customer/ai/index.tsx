import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAiStatus, useMyAssessments } from '../../../api/ai';
import { flatten } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { QueryFallback, notReady } from '../../../components/QueryState';
import { Badge, Button, Card, EmptyState, Icon, IconTile, Label, Text, colors, spacing } from '../../../design-system';
import { SeverityPill, SimulationBanner } from '../../../features/ai/components';
import { fmtDate, money } from '../../../utils/format';

/** HYDRA Smart Quote — entry point and "My AI Assessments" history (persists across sign-ins). */
export default function SmartQuoteHome() {
  const status = useAiStatus();
  const list = useMyAssessments();
  const items = flatten(list.data);
  const enabled = status.data?.enabled ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Smart Quote" back />
      <Screen withTabBar={false} onRefresh={() => void Promise.all([status.refetch(), list.refetch()])} refreshing={list.isRefetching}>
        <Card accent="secondary" style={{ gap: spacing.md, backgroundColor: '#18152A' }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconTile icon="cpu" tone="secondary" />
            <View style={{ flex: 1 }}>
              <Label color="secondaryBright">HYDRA Smart Quote</Label>
              <Text variant="h2">AI quotation & triage assistant</Text>
            </View>
          </View>
          <Text variant="bodySmall" color="textSecondary">
            Describe an electrical or solar problem and add photos. You’ll get a preliminary assessment: how serious it looks, the likely
            service, a price range and how quickly we aim to respond. Our team reviews anything uncertain or urgent.
          </Text>
          <Text variant="caption" color="textMuted">This is an assessment tool — it never gives DIY repair instructions. If anything is sparking, smoking or burning, keep away and call our 24/7 line.</Text>
          {status.data ? <SimulationBanner label={status.data.simulationLabel} /> : null}
          {status.data && !enabled ? (
            <Text variant="bodySmall" color="warning" testID="ai-unavailable">{status.data.unavailableReason}</Text>
          ) : null}
          <Button label="Start assessment" icon="message-circle" disabled={!enabled} onPress={() => router.push('/customer/ai/new')} testID="ai-start" haptic />
          {!enabled && status.data ? <Button label="Request a service instead" variant="outline" onPress={() => router.push('/customer/request')} /> : null}
        </Card>

        <Label>My AI assessments</Label>
        {notReady(list) ? <QueryFallback query={list} count={2} /> : items.length === 0 ? (
          <EmptyState icon="message-square" title="No assessments yet" message="Start an assessment to get a preliminary estimate in a few minutes." />
        ) : (
          items.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/customer/ai/${c.id}`)} accessibilityLabel={`Assessment ${c.reference}`} style={{ gap: 6 }} testID={`ai-history-${c.id}`}>
              <View style={styles.between}>
                <Text variant="mono" color="primaryBright">{c.reference}</Text>
                <Text variant="caption" color="textMuted">{fmtDate(c.createdAt)}</Text>
              </View>
              <Text variant="title" weight="bold" numberOfLines={2}>{c.title}</Text>
              <View style={styles.badges}>
                <Badge label={c.statusLabel} tone={c.status === 'CLOSED' ? 'neutral' : c.status === 'NEEDS_ADMIN_REVIEW' ? 'warning' : 'primary'} mono={false} />
                {c.severity ? <SeverityPill severity={c.severity} /> : null}
                {c.adminReview === 'PENDING' ? <Badge label="Team review pending" tone="warning" icon="clock" mono={false} /> : c.adminReview === 'REVIEWED' ? <Badge label="Reviewed by our team" tone="success" icon="check" mono={false} /> : null}
                {c.proposalStatus === 'ACCEPTED' ? <Badge label="Accepted" tone="success" mono={false} /> : c.proposalStatus === 'DECLINED' ? <Badge label="Declined" tone="neutral" mono={false} /> : null}
                {c.isSimulation ? <Badge label="Simulation" tone="secondary" mono={false} /> : null}
              </View>
              {c.estimateMin !== null && c.estimateMax !== null ? <Text variant="bodySmall">Preliminary estimate {money(c.estimateMin)} – {money(c.estimateMax)}</Text> : null}
              {c.jobReference ? (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Icon name="briefcase" size={14} color="success" />
                  <Text variant="caption" color="success">Service request {c.jobReference}</Text>
                </View>
              ) : null}
            </Card>
          ))
        )}
        {list.hasNextPage ? <Button label="Load more" variant="outline" onPress={() => void list.fetchNextPage()} /> : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
