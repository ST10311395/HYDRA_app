import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { JobDetailDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useJob, useJobAction } from '../../../api/queries';
import { JobStatusBadge, NotesSection, PersonRow, SegmentLink, Timeline } from '../../../components/jobs';
import { JobAiSection } from '../../../features/ai/JobAiSection';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, KeyValue, Label, Segmented, Text, TextField, colors, confirm, radius, spacing, toast } from '../../../design-system';
import { PhotoPicker } from '../../../features/photos';
import { useJobSubscription } from '../../../hooks/useRealtime';
import { fmtDateTime } from '../../../utils/format';
import { openDirections } from '../../../utils/links';
import { QueryFallback } from '../../../components/QueryState';

export default function EmployeeJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useJob(id);
  useJobSubscription(id);
  const [delay, setDelay] = useState<null | { minutes: string; note: string }>(null);
  const [milestone, setMilestone] = useState('');
  const [summary, setSummary] = useState('');
  const [photoPurpose, setPhotoPurpose] = useState<'JOB_PHOTO' | 'INSPECTION_EVIDENCE'>('JOB_PHOTO');
  const reportDelay = useJobAction((v: { minutes: number; note?: string }) => api.post<JobDetailDto>(`/jobs/${id}/delay`, v));
  const addMilestone = useJobAction((name: string) => api.post<JobDetailDto>(`/jobs/${id}/milestones`, { name }));
  const doneMilestone = useJobAction((mid: string) => api.post<JobDetailDto>(`/jobs/${id}/milestones/${mid}/complete`, {}));
  const complete = useJobAction((s: string) => api.post<JobDetailDto>(`/jobs/${id}/complete`, { summary: s || undefined }));
  const attach = useJobAction((fileIds: string[]) => api.post<JobDetailDto>(`/jobs/${id}/attachments`, { fileIds }));
  const j = q.data;
  const can = (a: string) => !!j?.allowedActions.includes(a);
  const onError = (e: unknown) => toast.error(errorMessage(e));

  // Directions to this job's own site (stored coordinates, else its address).
  const navigate = () => j && void openDirections({ latitude: j.siteLatitude, longitude: j.siteLongitude, address: j.siteAddress });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={j?.reference ?? 'Job'} back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!j ? <QueryFallback query={q} count={3} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.between}>
                <Text variant="mono" color="primaryBright">{j.reference}</Text>
                <JobStatusBadge status={j.status} />
              </View>
              <Text variant="h2">{j.serviceType.name}</Text>
              {j.scheduledStart ? <KeyValue label="Appointment" value={`${fmtDateTime(j.scheduledStart)}`} /> : null}
              <KeyValue label="Site" value={j.siteAddress} />
              {j.urgency !== 'STANDARD' ? <Badge label={j.urgency} tone={j.urgency === 'EMERGENCY' ? 'danger' : 'warning'} /> : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                <Button label="Navigate" icon="navigation" variant="secondary" size="sm" style={{ flex: 1 }} onPress={navigate} />
                {j.timeOnSiteMinutes !== null ? <Badge label={`${Math.floor(j.timeOnSiteMinutes / 60)}h ${j.timeOnSiteMinutes % 60}m on site`} tone="secondary" mono={false} /> : null}
              </View>
            </Card>

            <Card>
              <PersonRow icon="user" title="Customer" name={j.customer.name} phone={j.customer.phone} />
            </Card>

            {can('CHECK_IN') ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <Text variant="title" weight="bold">Arrived on site?</Text>
                <Text variant="bodySmall" color="textMuted">Scan the customer’s QR code to confirm arrival and start the job.</Text>
                <Button label="Scan customer QR" icon="maximize" onPress={() => router.navigate('/employee/scan')} haptic />
                {delay ? (
                  <View style={{ gap: spacing.sm }}>
                    <Segmented value={delay.minutes} onChange={(v) => setDelay({ ...delay, minutes: v })} options={[{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '1 hour' }, { value: '120', label: '2 hours' }]} />
                    <TextField placeholder="Reason (optional) — e.g. traffic on N2" value={delay.note} onChangeText={(v) => setDelay({ ...delay, note: v })} />
                    <Button label="Notify customer & office" icon="send" variant="secondary" loading={reportDelay.isPending} onPress={() => reportDelay.mutate({ minutes: Number(delay.minutes), note: delay.note || undefined }, { onSuccess: () => { setDelay(null); toast.success('Delay reported'); }, onError })} />
                  </View>
                ) : (
                  <Button label="Running late" icon="clock" variant="ghost" onPress={() => setDelay({ minutes: '30', note: '' })} />
                )}
              </Card>
            ) : null}

            <Card style={{ gap: spacing.md }}>
              <Label>Milestones</Label>
              <Timeline milestones={j.milestones} status={j.status} />
              {can('COMPLETE_MILESTONE') ? j.milestones.filter((m) => !m.code && m.status === 'PENDING').map((m) => (
                <Button key={m.id} label={`Mark “${m.name}” done`} icon="check" variant="secondary" size="sm" loading={doneMilestone.isPending} onPress={() => doneMilestone.mutate(m.id, { onSuccess: () => toast.success('Customer notified'), onError })} />
              )) : null}
              {can('ADD_MILESTONE') ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}><TextField placeholder="Add on-site milestone…" value={milestone} onChangeText={setMilestone} maxLength={80} /></View>
                  <Button label="Add" size="md" fullWidth={false} disabled={milestone.trim().length < 2} loading={addMilestone.isPending} onPress={() => addMilestone.mutate(milestone.trim(), { onSuccess: () => setMilestone(''), onError })} />
                </View>
              ) : null}
            </Card>

            {can('LOG_MATERIALS') ? <SegmentLink icon="package" label={`Materials used (${j.materials.length})`} onPress={() => router.push(`/employee/materials/${j.id}`)} /> : null}
            {can('SUBMIT_INSPECTION') ? (
              <Card accent="secondary" style={{ gap: spacing.md }}>
                <Text variant="title" weight="bold">Inspection & compliance report</Text>
                <Text variant="bodySmall" color="textMuted">Record test results and issue the Certificate of Compliance to complete the job.</Text>
                <Button label="Start inspection report" icon="clipboard" variant="violet" onPress={() => router.push(`/employee/inspection/${j.id}`)} />
              </Card>
            ) : null}
            {j.inspections.map((r) => (
              <SegmentLink key={r.id} icon="award" label={`Inspection ${r.complianceStatus}${r.certificateNumber ? ` · ${r.certificateNumber}` : ''}`} onPress={() => router.push(`/employee/report/${r.id}` as never)} />
            ))}

            {can('COMPLETE_WORK') ? (
              <Card style={{ gap: spacing.md }}>
                <Label>Finish work</Label>
                <TextField placeholder="Work summary for the customer (optional)" value={summary} onChangeText={setSummary} multiline maxLength={1000} />
                <Button label="Mark work complete" icon="check-circle" loading={complete.isPending} onPress={() => void (async () => {
                  if (await confirm({ title: 'Mark work complete?', message: 'The job moves to inspection. Log all materials first.', confirmLabel: 'Complete work' })) {
                    complete.mutate(summary, { onSuccess: () => toast.success('Work completed — submit the inspection next.'), onError });
                  }
                })()} />
              </Card>
            ) : null}

            <Card style={{ gap: spacing.md }}>
              <Label>Photos & evidence</Label>
              <View style={styles.photos}>
                {j.attachments.map((a) => <Image key={a.id} source={{ uri: a.url }} style={styles.photo} contentFit="cover" accessibilityLabel={a.fileName} />)}
              </View>
              {can('ADD_PHOTOS') ? (
                <>
                  <Segmented value={photoPurpose} onChange={setPhotoPurpose} options={[{ value: 'JOB_PHOTO', label: 'Job photo' }, { value: 'INSPECTION_EVIDENCE', label: 'Evidence' }]} />
                  <PhotoPicker value={[]} purpose={photoPurpose} label="Add photo" onChange={(p) => { const last = p[p.length - 1]; if (last) attach.mutate([last.id], { onError }); }} />
                </>
              ) : null}
            </Card>

            <View>
              <Label>Job description</Label>
              <Text variant="bodySmall" color="textSecondary" style={{ marginTop: 4 }}>{j.description}</Text>
            </View>
            <JobAiSection jobId={j.id} source={j.source} />
            <NotesSection job={j} canPost={!['PAID', 'CANCELLED'].includes(j.status)} staff />
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
