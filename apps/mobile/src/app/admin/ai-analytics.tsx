import { router } from 'expo-router';
import { View } from 'react-native';
import { useAiAnalytics } from '../../api/ai';
import { BrandHeader, Screen } from '../../components/layout';
import { QueryFallback } from '../../components/QueryState';
import { Card, KeyValue, Label, ProgressBar, StatTile, Text, colors, spacing } from '../../design-system';
import { fmtDate, money } from '../../utils/format';

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

/** Smart Quote analytics — every figure is computed from stored cases, feedback and jobs. */
export default function AiAnalytics() {
  const q = useAiAnalytics();
  const a = q.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="AI analytics" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!a ? <QueryFallback query={q} /> : (
          <>
            <Text variant="caption" color="textMuted">{fmtDate(a.from)} – {fmtDate(a.to)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              <View style={{ width: '47%', flexGrow: 1 }}><StatTile value={String(a.totals.enquiries)} label="AI enquiries" icon="message-square" /></View>
              <View style={{ width: '47%', flexGrow: 1 }}><StatTile value={pct(a.rates.aiResolutionRate)} label="Resolved by AI" icon="cpu" /></View>
              <View style={{ width: '47%', flexGrow: 1 }}><StatTile value={pct(a.rates.escalationRate)} label="Escalated to admin" icon="users" accent="secondary" /></View>
              <View style={{ width: '47%', flexGrow: 1 }}><StatTile value={pct(a.rates.acceptanceRate)} label="Proposals accepted" icon="check-circle" /></View>
            </View>
            <Card style={{ gap: 4 }}>
              <KeyValue label="Average AI confidence" value={a.averageConfidence === null ? '—' : `${a.averageConfidence}%`} />
              <KeyValue label="Converted to jobs" value={String(a.totals.converted)} />
              <KeyValue label="Knowledge entries added" value={String(a.totals.knowledgeAdded)} />
              <KeyValue label="AI answers corrected by admin" value={String(a.totals.correctedByAdmin)} />
              <KeyValue label="Provider failures" value={String(a.totals.providerFailures)} valueColor={a.totals.providerFailures ? 'warning' : 'text'} />
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Cases by severity</Label>
              {a.bySeverity.map((s) => (
                <View key={s.severity} style={{ gap: 2 }}>
                  <Text variant="caption">Severity {s.severity} · {s.count}</Text>
                  <ProgressBar value={a.totals.enquiries ? s.count / a.totals.enquiries : 0} tone={s.severity >= 4 ? 'secondary' : 'primary'} />
                </View>
              ))}
            </Card>
            <Card style={{ gap: 4 }}>
              <Label>Cases by service</Label>
              {a.byCategory.map((c) => <KeyValue key={c.category} label={c.label} value={String(c.count)} />)}
            </Card>
            <Card style={{ gap: 4 }}>
              <Label>Top escalation reasons</Label>
              {a.topEscalationReasons.length ? a.topEscalationReasons.map((r) => <KeyValue key={r.reason} label={r.label} value={String(r.count)} />) : <Text variant="caption" color="textMuted">None yet.</Text>}
            </Card>
            <Card style={{ gap: 4 }}>
              <Label>Unknown / low-confidence questions (knowledge candidates)</Label>
              {a.unknownQuestions.length ? a.unknownQuestions.map((u) => (
                <Text key={u.conversationId} variant="bodySmall" color="primaryBright" onPress={() => router.push(`/admin/ai-case/${u.conversationId}`)}>• {u.reference}: {u.message}</Text>
              )) : <Text variant="caption" color="textMuted">None.</Text>}
            </Card>
            <Card style={{ gap: 4 }}>
              <Label>Admin feedback on AI</Label>
              <Text variant="caption">Assessment: {Object.entries(a.feedback.assessment).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') || '—'}</Text>
              <Text variant="caption">Severity: {Object.entries(a.feedback.severity).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') || '—'}</Text>
              <Text variant="caption">Price: {Object.entries(a.feedback.price).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') || '—'}</Text>
              <Text variant="caption">Customers “helpful?”: {Object.entries(a.feedback.customerHelpful).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(' · ') || '—'}</Text>
            </Card>
            <Card style={{ gap: 4 }}>
              <Label>Estimate vs final quote / invoice</Label>
              <KeyValue label="Samples" value={String(a.estimateVariance.samples)} />
              <KeyValue label="Average absolute difference" value={a.estimateVariance.averageAbsoluteDifference === null ? '—' : money(a.estimateVariance.averageAbsoluteDifference)} />
              <KeyValue label="Average % variance" value={a.estimateVariance.averagePercentVariance === null ? '—' : `${a.estimateVariance.averagePercentVariance}%`} />
              {a.estimateVariance.items.slice(0, 10).map((v) => (
                <Text key={v.reference} variant="caption" color="textMuted">{v.reference} → {v.jobReference}: est. {money(v.estimateMid)} · quote {v.quoteTotal === null ? '—' : money(v.quoteTotal)} · invoice {v.invoiceTotal === null ? '—' : money(v.invoiceTotal)} ({v.percentVariance ?? '—'}%)</Text>
              ))}
              <Text variant="caption" color="textMuted">Informational only — pricing rules never change automatically from these figures.</Text>
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}
