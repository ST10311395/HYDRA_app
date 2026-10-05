/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { AiAssessmentDto, AiMessageDto, AiProposalDto } from '@hydra/shared';
import { Badge, Card, Icon, Label, ProgressBar, Text, colors, radius, spacing, type IconName } from '../../design-system';
import { money } from '../../utils/format';

type Tone = 'neutral' | 'primary' | 'warning' | 'danger';
const SEVERITY: Record<number, { tone: Tone; icon: IconName; name: string }> = {
  1: { tone: 'neutral', icon: 'info', name: 'Low' },
  2: { tone: 'primary', icon: 'alert-circle', name: 'Moderate' },
  3: { tone: 'warning', icon: 'alert-triangle', name: 'High' },
  4: { tone: 'danger', icon: 'alert-triangle', name: 'Urgent' },
  5: { tone: 'danger', icon: 'alert-octagon', name: 'Critical' },
};

export const severityMeta = (s: number) => SEVERITY[Math.min(5, Math.max(1, s))]!;

/** Severity as number, word and icon — never colour alone (accessibility). */
export function SeverityPill({ severity, name }: { severity: number; name?: string }) {
  const m = severityMeta(severity);
  return <Badge label={`${severity}/5 · ${(name ?? m.name).toUpperCase()}`} tone={m.tone} icon={m.icon} solid={severity === 5} />;
}

export function SeverityMeter({ severity, name }: { severity: number; name: string }) {
  const m = severityMeta(severity);
  const fill = m.tone === 'danger' ? colors.danger : m.tone === 'warning' ? colors.warning : m.tone === 'primary' ? colors.primary : colors.textMuted;
  return (
    <View accessible accessibilityLabel={`Severity ${severity} of 5, ${name}`} style={{ gap: 6 }}>
      <View style={styles.between}>
        <Text variant="h3">{severity} / 5 — {name}</Text>
        <Icon name={m.icon} color={m.tone === 'neutral' ? 'textMuted' : m.tone === 'primary' ? 'primaryBright' : m.tone === 'warning' ? 'warning' : 'dangerBright'} />
      </View>
      <View style={styles.segments}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i <= severity ? fill : colors.surfaceInset }]} />
        ))}
      </View>
    </View>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`AI confidence ${value} percent`}>
      <View style={styles.between}>
        <Label>AI confidence</Label>
        <Text variant="mono">{value}%</Text>
      </View>
      <ProgressBar value={value / 100} tone={value >= 80 ? 'primary' : 'secondary'} />
    </View>
  );
}

export function SimulationBanner({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <View style={styles.sim} accessibilityRole="text" testID="ai-simulation-banner">
      <Icon name="cpu" size={14} color="secondaryBright" />
      <Text variant="caption" color="secondaryBright">{label} — results are simulated for testing, not real AI analysis.</Text>
    </View>
  );
}

export function SafetyWarning({ text }: { text: string }) {
  return (
    <Card accent="danger" style={{ gap: spacing.sm, backgroundColor: colors.dangerMuted }} testID="ai-safety-warning">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="alert-octagon" color="dangerBright" />
        <Text variant="title" weight="bold" color="dangerBright">Safety warning</Text>
      </View>
      <Text variant="bodySmall">{text}</Text>
    </Card>
  );
}

export function MessageBubble({ m }: { m: AiMessageDto }) {
  if (m.role === 'SYSTEM') {
    return <Text variant="caption" color="textMuted" align="center" style={{ paddingHorizontal: spacing.lg }}>{m.body}</Text>;
  }
  if (m.kind === 'SAFETY_WARNING') return <SafetyWarning text={m.body} />;
  const mine = m.role === 'CUSTOMER';
  const team = m.role === 'ADMIN';
  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.bubble, mine ? styles.mine : team ? styles.team : styles.assistant]} accessible accessibilityLabel={`${m.authorLabel}: ${m.body}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={mine ? 'user' : team ? 'users' : 'zap'} size={12} color={mine ? 'white' : team ? 'success' : 'primaryBright'} />
          <Text variant="caption" color={mine ? 'white' : team ? 'success' : 'primaryBright'}>{m.authorLabel}</Text>
        </View>
        <Text variant="bodySmall" color={mine ? 'white' : 'text'}>{m.body}</Text>
        {m.questions.length ? (
          <View style={{ gap: 4 }}>
            {m.questions.map((q) => (
              <Text key={q} variant="bodySmall" color="textSecondary">• {q}</Text>
            ))}
          </View>
        ) : null}
        {m.attachments.length ? (
          <View style={styles.thumbs}>
            {m.attachments.map((a) => (
              <Image key={a.id} source={{ uri: a.url }} style={styles.thumb} contentFit="cover" accessibilityLabel={`Attached photo ${a.fileName}`} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

/** "HYDRA SMART ASSESSMENT" card: issue, category, severity, response target, estimate, confidence, notices. */
export function AssessmentCard({ a, proposal, disclaimer, estimateNotice }: { a: AiAssessmentDto; proposal: AiProposalDto | null; disclaimer: string; estimateNotice: string }) {
  return (
    <Card accent={a.severity >= 4 ? 'danger' : 'primary'} style={{ gap: spacing.md }} testID="ai-assessment-card">
      <View style={styles.between}>
        <Label color="primaryBright">HYDRA Smart Assessment</Label>
        <SeverityPill severity={a.severity} name={a.severityName} />
      </View>
      <Row label="Reported issue"><Text variant="body">{a.summary}</Text></Row>
      <Row label="Service category"><Text variant="title" weight="bold">{a.serviceCategoryLabel}</Text></Row>
      <SeverityMeter severity={a.severity} name={a.severityName} />
      {a.severityReason ? <Text variant="caption" color="textMuted">Why: {a.severityReason}</Text> : null}
      {a.observations.length ? (
        <Row label="Observations">
          {a.observations.map((o) => <Text key={o} variant="bodySmall" color="textSecondary">• {o}</Text>)}
        </Row>
      ) : null}
      {a.safetyFlags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {a.safetyFlags.map((f) => <Badge key={f} label={f} tone="danger" icon="alert-triangle" mono={false} />)}
        </View>
      ) : null}
      <Row label="Target response">
        <Text variant="bodySmall">{a.response.wording}</Text>
        {a.response.outOfHoursNotice ? <Text variant="caption" color="warning">{a.response.outOfHoursNotice}</Text> : null}
      </Row>
      {proposal ? (
        <View style={styles.estimate} testID="ai-estimate">
          <Label>Preliminary estimate</Label>
          <Text variant="stat" color="primaryBright">{money(proposal.priceMin)} – {money(proposal.priceMax)}</Text>
          {a.estimate ? (
            <>
              <Text variant="caption" color="textMuted">Estimated service range {money(a.estimate.serviceMin)} – {money(a.estimate.serviceMax)}</Text>
              <Text variant="caption" color="textMuted">Possible material cost {money(a.estimate.materialsMin)} – {money(a.estimate.materialsMax)}</Text>
              <Text variant="caption" color="textMuted">{a.estimate.includesVat ? 'Includes VAT' : 'Excludes VAT'}</Text>
            </>
          ) : null}
          <Text variant="caption" weight="bold">Estimate includes</Text>
          {proposal.includes.map((i) => <Text key={i} variant="caption" color="textSecondary">• {i}</Text>)}
          <Text variant="caption" weight="bold">Potential additional costs</Text>
          {proposal.potentialAdditionalCosts.map((i) => <Text key={i} variant="caption" color="textSecondary">• {i}</Text>)}
          {proposal.priceSource === 'ADMIN' || proposal.approvedByAdmin ? <Badge label="Reviewed by PSG Electrical" tone="success" icon="check" mono={false} /> : null}
        </View>
      ) : null}
      <ConfidenceBar value={a.confidence} />
      {a.imageAnalysis.notice ? <Text variant="caption" color="textMuted">📷 {a.imageAnalysis.notice}</Text> : null}
      <View style={styles.notice}>
        <Text variant="caption" weight="bold">Important</Text>
        <Text variant="caption" color="textSecondary">{estimateNotice}</Text>
        <Text variant="caption" color="textMuted">{disclaimer}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  sim: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.secondaryMuted, borderWidth: 1, borderColor: colors.secondaryBorder },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: spacing.md, gap: 6, borderWidth: 1 },
  mine: { backgroundColor: colors.primary, borderColor: colors.primary },
  assistant: { backgroundColor: colors.surface, borderColor: colors.border },
  team: { backgroundColor: colors.successMuted, borderColor: 'rgba(44,203,140,0.45)' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  estimate: { gap: 4, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.primaryBorder },
  notice: { gap: 4, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningMuted, borderWidth: 1, borderColor: 'rgba(244,183,64,0.45)' },
});
