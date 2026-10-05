/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { useInspection } from '../api/queries';
import { BrandHeader, Screen } from '../components/layout';
import { Badge, Button, Card, Icon, KeyValue, Label, Text, colors, radius, spacing } from '../design-system';
import { fmtDate, fmtDateTime } from '../utils/format';
import { QueryFallback } from '../components/QueryState';

/** Inspection / Certificate of Compliance record (PDF Story 9) — linked to its job, visible per permissions. */
export function InspectionReportView({ id }: { id: string }) {
  const q = useInspection(id);
  const r = q.data;
  const tone = r?.complianceStatus === 'PASS' ? 'success' : r?.complianceStatus === 'FAIL' ? 'danger' : 'warning';
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Compliance Report" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!r ? <QueryFallback query={q} count={2} /> : (
          <>
            <Card accent={tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : 'none'} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label>{r.complianceStatus === 'FAIL' ? 'Inspection report' : 'Certificate of Compliance'}</Label>
                <Badge label={r.complianceStatus} tone={tone} />
              </View>
              <Text variant="h2">{r.certificateNumber ?? 'No certificate issued'}</Text>
              <KeyValue label="Job" value={r.jobReference} mono />
              <KeyValue label="Inspected by" value={r.employeeName} />
              <KeyValue label="Inspection date" value={fmtDate(r.inspectionDate)} />
              <KeyValue label="Submitted" value={fmtDateTime(r.submittedAt)} />
              <Text variant="caption" color="textMuted">Standard: SANS 10142-1 wiring code</Text>
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Findings</Label>
              <Text variant="bodySmall" color="textSecondary">{r.findings}</Text>
              {r.notes ? <Text variant="bodySmall" color="textMuted">{r.notes}</Text> : null}
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Tests & checklist</Label>
              {r.checklist.map((c) => (
                <View key={c.key} style={styles.check}>
                  <Icon name={c.result === 'PASS' ? 'check-circle' : c.result === 'FAIL' ? 'x-circle' : 'minus-circle'} size={16} color={c.result === 'PASS' ? 'success' : c.result === 'FAIL' ? 'dangerBright' : 'textMuted'} />
                  <Text variant="bodySmall" style={{ flex: 1 }}>{c.label}</Text>
                  {c.reading ? <Text variant="mono" color="textMuted" style={{ fontSize: 12 }}>{c.reading}</Text> : null}
                </View>
              ))}
            </Card>
            {r.attachments.length ? (
              <Card style={{ gap: spacing.sm }}>
                <Label>Evidence photos</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {r.attachments.map((a) => <Image key={a.id} source={{ uri: a.url }} style={styles.photo} contentFit="cover" accessibilityLabel={a.fileName} />)}
                </View>
              </Card>
            ) : null}
            <Card style={{ gap: spacing.sm }}>
              <Label>Declaration</Label>
              <Text variant="bodySmall" color="textSecondary">Signed by {r.signatureName}, registered electrician, confirming the installation was inspected and tested.</Text>
              {r.document ? <Button label="Open certificate document" icon="file" variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(r.document!.url)} /> : null}
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 32 },
  photo: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
});
