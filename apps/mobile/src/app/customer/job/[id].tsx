import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { JobDetailDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useJob, useJobAction } from '../../../api/queries';
import { JobStatusBadge, NotesSection, PersonRow, SegmentLink, Timeline } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, KeyValue, Label, Text, colors, confirm, radius, spacing, toast } from '../../../design-system';
import { PhotoPicker } from '../../../features/photos';
import { useJobSubscription } from '../../../hooks/useRealtime';
import { fmtDate, fmtDateTime, money } from '../../../utils/format';
import { QueryFallback } from '../../../components/QueryState';

export default function CustomerJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useJob(id);
  useJobSubscription(id);
  const cancel = useJobAction((reason: string) => api.post<JobDetailDto>(`/jobs/${id}/cancel`, { reason }));
  const attach = useJobAction((fileIds: string[]) => api.post<JobDetailDto>(`/jobs/${id}/attachments`, { fileIds }));
  const j = q.data;
  const can = (a: string) => !!j?.allowedActions.includes(a);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={j ? j.reference : 'Job'} back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!j ? <QueryFallback query={q} count={3} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.between}>
                <Text variant="mono" color="primaryBright">{j.reference}</Text>
                <JobStatusBadge status={j.status} />
              </View>
              <Text variant="h2">{j.serviceType.name}</Text>
              <KeyValue label="Site" value={j.siteAddress} />
              {j.scheduledStart ? <KeyValue label="Scheduled" value={fmtDateTime(j.scheduledStart)} /> : j.preferredDate ? <KeyValue label="Preferred date" value={fmtDate(j.preferredDate)} /> : null}
              {j.urgency !== 'STANDARD' ? <Badge label={j.urgency} tone={j.urgency === 'EMERGENCY' ? 'danger' : 'warning'} /> : null}
              {j.cancelledReason ? <Text variant="bodySmall" color="dangerBright">Cancelled: {j.cancelledReason}</Text> : null}
            </Card>

            {can('ACCEPT_QUOTE') && j.quote ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <Text variant="title" weight="bold">Your quote is ready</Text>
                <Text variant="h1" color="primaryBright">{money(j.quote.total)}</Text>
                <Button label="Review & respond" iconRight="arrow-right" onPress={() => router.push(`/customer/quote/${j.quote!.id}`)} />
              </Card>
            ) : null}
            {can('SHOW_QR') ? (
              <Card accent="secondary" style={{ gap: spacing.md }}>
                <Text variant="title" weight="bold">Show this QR when your electrician arrives</Text>
                <Text variant="bodySmall" color="textMuted">Scanning it confirms arrival and starts your live timeline.</Text>
                <Button label="Show arrival QR code" icon="maximize" variant="violet" onPress={() => router.push(`/customer/qr/${j.id}`)} />
              </Card>
            ) : null}
            {can('PAY_INVOICE') && j.invoice ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <View style={styles.between}>
                  <Text variant="title" weight="bold">Invoice {j.invoice.number}</Text>
                  <Text variant="h3" color="warning">{money(j.invoice.amountDue)} due</Text>
                </View>
                <Button label="View & pay invoice" icon="credit-card" onPress={() => router.push(`/customer/invoice/${j.invoice!.id}`)} />
              </Card>
            ) : null}

            <Card style={{ gap: spacing.md }}>
              <View style={styles.between}>
                <Label>Live progress</Label>
                <Badge label="LIVE" icon="radio" tone="success" />
              </View>
              <Timeline milestones={j.milestones} status={j.status} />
            </Card>

            {j.electrician ? (
              <Card style={{ gap: spacing.md }}>
                <PersonRow icon="zap" title="Your electrician" name={j.electrician.name} phone={j.electrician.phone} />
                {j.checkins[0] ? (
                  <Text variant="caption" color="success">✓ Arrival confirmed {fmtDateTime(j.checkins[0].scannedAt)} ({j.checkins[0].method === 'QR' ? 'QR scan' : 'office confirmed'})</Text>
                ) : null}
              </Card>
            ) : null}

            {j.inspections.length ? (
              <>
                <Label>Compliance</Label>
                {j.inspections.map((r) => (
                  <SegmentLink key={r.id} icon="award" label={`${r.complianceStatus === 'FAIL' ? 'Inspection report' : 'Certificate of Compliance'}${r.certificateNumber ? ` · ${r.certificateNumber}` : ''}`} onPress={() => router.push(`/customer/report/${r.id}`)} />
                ))}
              </>
            ) : null}

            {j.materials.length ? (
              <Card style={{ gap: 6 }}>
                <Label>Materials used</Label>
                {j.materials.map((m) => <KeyValue key={m.id} label={`${m.materialName} × ${m.quantityUsed} ${m.unit}`} value={money(m.lineCost)} mono />)}
              </Card>
            ) : null}

            <Card style={{ gap: spacing.md }}>
              <Label>Photos</Label>
              <View style={styles.photos}>
                {j.attachments.map((a) => <Image key={a.id} source={{ uri: a.url }} style={styles.photo} contentFit="cover" accessibilityLabel={a.fileName} />)}
              </View>
              {can('ADD_PHOTOS') ? (
                <PhotoPicker value={[]} onChange={(p) => { const last = p[p.length - 1]; if (last) attach.mutate([last.id], { onError: (e) => toast.error(errorMessage(e)) }); }} purpose="JOB_PHOTO" label="Add a photo" />
              ) : null}
            </Card>

            <View>
              <Label>Description</Label>
              <Text variant="bodySmall" color="textSecondary" style={{ marginTop: 4 }}>{j.description}</Text>
            </View>

            <NotesSection job={j} canPost={j.status !== 'CANCELLED'} staff={false} />

            {can('CANCEL') ? (
              <Button label="Cancel this request" icon="x-circle" variant="dangerOutline" loading={cancel.isPending} onPress={() => void (async () => {
                if (await confirm({ title: 'Cancel this job?', message: 'Your request will be closed. This cannot be undone.', confirmLabel: 'Cancel job', destructive: true })) {
                  cancel.mutate('Cancelled by customer in app', { onSuccess: () => toast.success('Job cancelled'), onError: (e) => toast.error(errorMessage(e)) });
                }
              })()} />
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
});
