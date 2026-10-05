import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { JobDetailDto, QuoteDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useJob, useJobAction, useSimpleMutation } from '../../../api/queries';
import { JobStatusBadge, NotesSection, PersonRow, QuoteBreakdown, SegmentLink, Timeline } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Divider, KeyValue, Label, Text, TextField, colors, confirm, radius, spacing, toast } from '../../../design-system';
import { useJobSubscription } from '../../../hooks/useRealtime';
import { fmtDate, fmtDateTime, invoiceTone, money } from '../../../utils/format';
import { mapPinUrl, openDirections, openExternal } from '../../../utils/links';
import { QueryFallback } from '../../../components/QueryState';

const WINDOW: Record<string, string> = { MORNING: 'Morning (08:00–12:00)', AFTERNOON: 'Afternoon (12:00–17:00)', ANY: 'Any time' };

function minutesLabel(m: number | null): string {
  if (m === null) return '—';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Admin job monitoring detail (spec §10.5): lifecycle-driven actions, check-ins, materials, inspection, history. */
export default function AdminJobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useJob(id);
  useJobSubscription(id);
  const j = q.data;
  const can = (a: string) => !!j?.allowedActions.includes(a);
  const [arrivalReason, setArrivalReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [panel, setPanel] = useState<'none' | 'arrival' | 'cancel'>('none');

  const confirmArrival = useJobAction((reason: string) => api.post<JobDetailDto>(`/jobs/${id}/confirm-arrival`, { reason }));
  const cancel = useJobAction((reason: string) => api.post<JobDetailDto>(`/jobs/${id}/cancel`, { reason }));
  const sendQuote = useSimpleMutation((quoteId: string) => api.post<QuoteDto>(`/quotes/${quoteId}/send`), [['job', id], ['jobs'], ['dashboard']]);

  const quotedMaterials = j?.quote?.materialsCost ?? 0;
  const variance = j ? j.materialsCost - quotedMaterials : 0;

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
              <KeyValue label="Source" value={j.source.replace('_', ' ').toLowerCase()} />
              <KeyValue label="Requested" value={fmtDateTime(j.createdAt)} />
              {j.preferredDate ? <KeyValue label="Preferred" value={`${fmtDate(j.preferredDate)} · ${WINDOW[j.preferredTimeWindow] ?? j.preferredTimeWindow}`} /> : null}
              {j.scheduledStart ? <KeyValue label="Scheduled" value={`${fmtDateTime(j.scheduledStart)} – ${fmtDateTime(j.scheduledEnd)}`} /> : null}
              {j.urgency !== 'STANDARD' ? <Badge label={j.urgency} tone={j.urgency === 'EMERGENCY' ? 'danger' : 'warning'} icon="alert-octagon" /> : null}
              {j.cancelledReason ? <Text variant="bodySmall" color="dangerBright">Cancelled: {j.cancelledReason}</Text> : null}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <Button label="Directions" icon="navigation" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void openDirections({ latitude: j.siteLatitude, longitude: j.siteLongitude, address: j.siteAddress })} />
                <Button label="Customer" icon="user" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/admin/customer/${j.customer.id}`)} />
              </View>
            </Card>

            {/* Lifecycle actions — only those the server says are valid for this state are shown. */}
            <Card accent="primary" style={{ gap: spacing.sm }}>
              <Label color="primaryBright">Next actions</Label>
              {j.allowedActions.length === 0 ? <Text variant="bodySmall" color="textMuted">No office action is required at this stage.</Text> : null}
              {can('CREATE_QUOTE') ? <Button label={j.quote && j.status !== 'REQUESTED' ? 'Revise quote' : 'Build quote'} icon="file-text" onPress={() => router.push(`/admin/quote/${j.id}`)} /> : null}
              {can('ASSIGN') ? <Button label="Assign electrician" icon="user-plus" onPress={() => router.push(`/admin/assign/${j.id}`)} /> : null}
              {can('REASSIGN') ? <Button label="Reassign / reschedule" icon="repeat" variant="secondary" onPress={() => router.push(`/admin/assign/${j.id}`)} /> : null}
              {can('CONFIRM_ARRIVAL') ? <Button label="Confirm arrival (QR failed)" icon="map-pin" variant="violet" onPress={() => setPanel(panel === 'arrival' ? 'none' : 'arrival')} /> : null}
              {can('LOG_MATERIALS') ? <Button label="Log materials" icon="package" variant="secondary" onPress={() => router.push(`/admin/materials/${j.id}`)} /> : null}
              {can('GENERATE_INVOICE') ? <Button label="Generate invoice" icon="file-plus" onPress={() => router.push(`/admin/new-invoice/${j.id}`)} /> : null}
              {j.invoice ? <Button label={`Invoice ${j.invoice.number}`} icon="credit-card" variant="secondary" onPress={() => router.push(`/admin/invoice/${j.invoice!.id}`)} /> : null}
              {can('CANCEL') ? <Button label="Cancel job" icon="x-circle" variant="dangerOutline" onPress={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')} /> : null}

              {panel === 'arrival' ? (
                <View style={styles.panel}>
                  <Text variant="bodySmall" color="textMuted">Use only when the electrician is on site and the QR scan failed. This is recorded in the audit log.</Text>
                  <TextField label="Reason" value={arrivalReason} onChangeText={setArrivalReason} placeholder="e.g. Customer phone battery flat" maxLength={500} />
                  <Button label="Confirm arrival" icon="check" loading={confirmArrival.isPending} disabled={arrivalReason.trim().length < 5} onPress={() => confirmArrival.mutate(arrivalReason.trim(), {
                    onSuccess: () => { toast.success('Arrival confirmed — job in progress'); setPanel('none'); setArrivalReason(''); },
                    onError: (e) => toast.error(errorMessage(e)),
                  })} />
                </View>
              ) : null}
              {panel === 'cancel' ? (
                <View style={styles.panel}>
                  <TextField label="Cancellation reason" value={cancelReason} onChangeText={setCancelReason} placeholder="Shared with the customer" maxLength={500} />
                  <Button label="Cancel this job" variant="danger" loading={cancel.isPending} disabled={cancelReason.trim().length < 3} onPress={() => void (async () => {
                    if (!(await confirm({ title: `Cancel ${j.reference}?`, message: 'The customer and electrician will be notified. This cannot be undone.', confirmLabel: 'Cancel job', destructive: true }))) return;
                    cancel.mutate(cancelReason.trim(), { onSuccess: () => { toast.success('Job cancelled'); setPanel('none'); }, onError: (e) => toast.error(errorMessage(e)) });
                  })()} />
                </View>
              ) : null}
            </Card>

            <Card style={{ gap: spacing.md }}>
              <PersonRow icon="user" title="Customer" name={j.customer.name} phone={j.customer.phone} />
              {j.electrician ? <><Divider /><PersonRow icon="zap" title="Electrician" name={j.electrician.name} phone={j.electrician.phone} /></> : <Text variant="caption" color="textMuted">No electrician assigned yet.</Text>}
            </Card>

            {j.quote ? (
              <Card style={{ gap: spacing.md }}>
                <View style={styles.between}>
                  <Label>Quote v{j.quote.version}</Label>
                  <Badge label={j.quote.status} tone={j.quote.status === 'ACCEPTED' ? 'success' : j.quote.status === 'DECLINED' ? 'danger' : j.quote.status === 'SENT' ? 'warning' : 'neutral'} />
                </View>
                <QuoteBreakdown quote={j.quote} />
                {j.quote.declineReason ? <Text variant="bodySmall" color="dangerBright">Declined: {j.quote.declineReason}</Text> : null}
                {j.quote.status === 'DRAFT' ? (
                  <Button label="Send quote to customer" icon="send" loading={sendQuote.isPending} onPress={() => sendQuote.mutate(j.quote!.id, { onSuccess: () => toast.success('Quote sent'), onError: (e) => toast.error(errorMessage(e)) })} />
                ) : null}
              </Card>
            ) : null}

            <Card style={{ gap: spacing.md }}>
              <Label>Milestones</Label>
              <Timeline milestones={j.milestones} status={j.status} />
            </Card>

            <Card style={{ gap: spacing.sm }}>
              <Label>Arrival & time on site</Label>
              {j.checkins.length === 0 ? <Text variant="bodySmall" color="textMuted">No check-in recorded.</Text> : j.checkins.map((c) => (
                <View key={c.id} style={styles.checkin}>
                  <View style={styles.between}>
                    <Text variant="title" weight="bold">{c.employeeName}</Text>
                    <Badge label={c.method === 'QR' ? 'QR + GPS' : 'OFFICE OVERRIDE'} tone={c.method === 'QR' ? 'success' : 'warning'} />
                  </View>
                  <Text variant="caption" color="textMuted">{fmtDateTime(c.scannedAt)}</Text>
                  {c.latitude !== null && c.longitude !== null ? (
                    <Button label={`GPS ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}${c.accuracy ? ` (±${Math.round(c.accuracy)} m)` : ''}`} icon="map" size="sm" variant="ghost" fullWidth={false}
                      onPress={() => void openExternal(mapPinUrl(c.latitude!, c.longitude!))} />
                  ) : null}
                </View>
              ))}
              <KeyValue label="Time on site" value={minutesLabel(j.timeOnSiteMinutes)} mono />
            </Card>

            <Card style={{ gap: 6 }}>
              <Label>Materials vs quote</Label>
              {j.materials.length === 0 ? <Text variant="bodySmall" color="textMuted">No materials logged.</Text> : j.materials.map((m) => (
                <KeyValue key={m.id} label={`${m.materialName} × ${m.quantityUsed} ${m.unit} · ${m.loggedByName}`} value={money(m.lineCost)} mono />
              ))}
              <Divider style={{ marginVertical: 4 }} />
              <KeyValue label="Actual materials" value={money(j.materialsCost)} mono />
              <KeyValue label="Quoted materials" value={j.quote ? money(quotedMaterials) : '—'} mono />
              {j.quote ? <KeyValue label="Variance" value={`${variance > 0 ? '+' : ''}${money(variance)}`} valueColor={variance > 0 ? 'warning' : 'success'} mono /> : null}
            </Card>

            {j.inspections.length ? (
              <View style={{ gap: spacing.sm }}>
                <Label>Inspection / compliance</Label>
                {j.inspections.map((r) => (
                  <SegmentLink key={r.id} icon="award" label={`${r.complianceStatus} · ${r.certificateNumber ?? 'no certificate'} · ${fmtDate(r.inspectionDate)}`} onPress={() => router.push(`/admin/report/${r.id}`)} />
                ))}
              </View>
            ) : null}

            {j.invoice ? (
              <Card style={{ gap: 6 }}>
                <View style={styles.between}>
                  <Label>Invoice {j.invoice.number}</Label>
                  <Badge label={j.invoice.status.replace('_', ' ')} tone={invoiceTone(j.invoice.status)} />
                </View>
                <KeyValue label="Total" value={money(j.invoice.total)} mono />
                <KeyValue label="Amount due" value={money(j.invoice.amountDue)} valueColor={j.invoice.amountDue > 0 ? 'warning' : 'success'} mono />
              </Card>
            ) : null}

            {j.assignmentHistory?.length ? (
              <Card style={{ gap: spacing.sm }}>
                <Label>Assignment history</Label>
                {j.assignmentHistory.map((a) => (
                  <View key={a.id} style={{ gap: 2 }}>
                    <Text variant="bodySmall" weight="semibold">{a.assignedToName}</Text>
                    <Text variant="caption" color="textMuted">by {a.assignedByName} · {fmtDateTime(a.createdAt)}{a.notes ? ` · ${a.notes}` : ''}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {j.attachments.length ? (
              <Card style={{ gap: spacing.md }}>
                <Label>Photos</Label>
                <View style={styles.photos}>
                  {j.attachments.map((a) => <Image key={a.id} source={{ uri: a.url }} style={styles.photo} contentFit="cover" accessibilityLabel={a.fileName} />)}
                </View>
              </Card>
            ) : null}

            <View>
              <Label>Description</Label>
              <Text variant="bodySmall" color="textSecondary" style={{ marginTop: 4 }}>{j.description}</Text>
            </View>

            <NotesSection job={j} canPost={j.status !== 'CANCELLED'} staff />
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  panel: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceInset, borderWidth: 1, borderColor: colors.border },
  checkin: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
});
