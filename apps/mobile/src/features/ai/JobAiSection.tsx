/*
 * Code Attribution
 * Anthropic. 2026. Claude Code documentation. Available at: https://docs.anthropic.com/en/docs/claude-code [Accessed 5 October 2026].
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useJobAiSummary } from '../../api/ai';
import { Badge, Card, Label, Text, radius, spacing } from '../../design-system';
import { money } from '../../utils/format';
import { SeverityPill } from './components';

/**
 * Smart Quote context on a job that came from an AI case. Electricians see it only for jobs assigned to
 * them (API-enforced) and never see pricing; admins can open the full case.
 */
export function JobAiSection({ jobId, source, adminLink }: { jobId: string; source: string; adminLink?: boolean }) {
  const enabled = source === 'AI_ASSESSMENT';
  const q = useJobAiSummary(enabled ? jobId : '');
  const a = q.data?.assessment;
  if (!enabled || !a) return null;
  return (
    <Card accent="secondary" style={{ gap: spacing.sm }} onPress={adminLink ? () => router.push(`/admin/ai-case/${a.conversationId}`) : undefined} accessibilityLabel={`Smart Quote assessment ${a.reference}`} testID="job-ai-section">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Label color="secondaryBright">Smart Quote {a.reference}</Label>
        <SeverityPill severity={a.severity} name={a.severityName} />
      </View>
      <Text variant="bodySmall">{a.summary}</Text>
      <Text variant="caption" color="textMuted">{a.serviceCategoryLabel}</Text>
      {a.safetyFlags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{a.safetyFlags.map((f) => <Badge key={f} label={f} tone="danger" icon="alert-triangle" mono={false} />)}</View>
      ) : null}
      {a.observations.map((o) => <Text key={o} variant="caption" color="textSecondary">• {o}</Text>)}
      {a.attachments.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {a.attachments.map((p) => <Image key={p.id} source={{ uri: p.url }} style={{ width: 56, height: 56, borderRadius: radius.sm }} contentFit="cover" accessibilityLabel="Customer photo" />)}
        </View>
      ) : null}
      {a.estimate ? <Text variant="caption" color="textMuted">Preliminary estimate accepted: {money(a.estimate.min)} – {money(a.estimate.max)}</Text> : null}
    </Card>
  );
}
