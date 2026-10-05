import { router } from 'expo-router';
import { View } from 'react-native';
import { flatten, useInspections } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Card, Text, spacing } from '../../design-system';
import { fmtDate } from '../../utils/format';

/** Compliance register (spec §5.4 “review compliance records”): every inspection / CoC, newest first. */
export default function Compliance() {
  const q = useInspections();
  return (
    <AdminList
      section="Compliance"
      items={flatten(q.data)}
      query={q}
      emptyIcon="award"
      emptyTitle="No inspection reports yet"
      emptyMessage="Reports appear here when electricians submit an inspection for a job."
      renderItem={({ item: r }) => (
        <Card onPress={() => router.push(`/admin/report/${r.id}`)} accessibilityLabel={`Inspection ${r.jobReference}, ${r.complianceStatus}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="mono" color="primaryBright">{r.jobReference}</Text>
            <Badge label={r.complianceStatus} tone={r.complianceStatus === 'PASS' ? 'success' : r.complianceStatus === 'FAIL' ? 'danger' : 'warning'} />
          </View>
          <Text variant="title" weight="bold">{r.certificateNumber ? `CoC ${r.certificateNumber}` : 'No certificate issued'}</Text>
          <Text variant="caption" color="textMuted">{r.employeeName} · inspected {fmtDate(r.inspectionDate)}{r.document ? ' · document attached' : ''}</Text>
        </Card>
      )}
    />
  );
}
