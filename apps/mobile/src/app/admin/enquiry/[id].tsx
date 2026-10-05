import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { ContactQueryDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useEnquiry, useServices, useSimpleMutation } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Checkbox, KeyValue, Label, SelectField, Text, TextField, colors, spacing, toast } from '../../../design-system';
import { fmtDateTime } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { callNumber, sendEmail } from '../../../utils/links';
import { QueryFallback } from '../../../components/QueryState';

export default function EnquiryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useEnquiry(id);
  const services = useServices();
  const e = q.data;
  const [notes, setNotes] = useState('');
  const [conv, setConv] = useState({ serviceTypeId: '', siteAddress: '', description: '', createCustomerIfMissing: true });
  useSyncFrom(e, (x) => {
    setNotes(x.adminNotes ?? '');
    const addr = (x.details as { siteAddress?: string } | null)?.siteAddress ?? '';
    setConv((c) => ({ ...c, siteAddress: c.siteAddress || addr }));
  });
  const update = useSimpleMutation((body: object) => api.patch<ContactQueryDto>(`/contact-queries/${id}`, body), [['enquiry', id], ['enquiries'], ['dashboard']]);
  const convert = useSimpleMutation((body: object) => api.post<{ jobId: string; jobReference: string; customerProvisioned: boolean }>(`/contact-queries/${id}/convert`, body), [['enquiry', id], ['enquiries'], ['jobs'], ['dashboard']]);
  const details = (e?.details ?? {}) as Record<string, string | number | undefined>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={e?.reference ?? 'Enquiry'} back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!e ? <QueryFallback query={q} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="mono" color="primaryBright">{e.reference}</Text>
                <Badge label={e.status.replace('_', ' ')} tone={e.status === 'CONVERTED' ? 'success' : e.status === 'NEW' ? 'primary' : 'neutral'} />
              </View>
              <Text variant="h2">{e.name}</Text>
              <KeyValue label="Email" value={e.email} />
              <KeyValue label="Phone" value={e.phone} />
              <KeyValue label="Sector" value={e.sector ?? '—'} />
              <KeyValue label="Urgency" value={e.urgency} valueColor={e.urgency === 'EMERGENCY' ? 'dangerBright' : 'text'} />
              <KeyValue label="Received" value={fmtDateTime(e.submittedAt)} />
              <KeyValue label="Assigned to" value={e.assignedAdminName ?? 'Unassigned'} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Call" icon="phone" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void callNumber(e.phone)} />
                <Button label="Email" icon="mail" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => void sendEmail(e.email, `Your enquiry ${e.reference}`)} />
              </View>
            </Card>
            <Card style={{ gap: spacing.sm }}>
              <Label>Message</Label>
              <Text variant="body" color="textSecondary">{e.message}</Text>
              {Object.entries(details).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => <KeyValue key={k} label={k.replace(/([A-Z])/g, ' $1').toLowerCase()} value={String(v)} />)}
            </Card>

            {e.status === 'CONVERTED' ? (
              <Card accent="success" style={{ gap: spacing.sm }}>
                <Text variant="title" weight="bold">Converted to job {e.convertedJobReference}</Text>
                <Button label="Open job" iconRight="arrow-right" onPress={() => router.push(`/admin/job/${e.convertedJobId}`)} />
              </Card>
            ) : (
              <>
                <Card style={{ gap: spacing.md }}>
                  <Label>Triage</Label>
                  <TextField label="Admin notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Button label="Take & mark in progress" size="sm" variant="secondary" style={{ flex: 1 }} loading={update.isPending} onPress={() => update.mutate({ status: 'IN_PROGRESS', adminNotes: notes || undefined, assignToMe: true }, { onSuccess: () => toast.success('Updated'), onError: (x) => toast.error(errorMessage(x)) })} />
                    <Button label="Close" size="sm" variant="outline" style={{ flex: 1 }} loading={update.isPending} onPress={() => update.mutate({ status: 'CLOSED', adminNotes: notes || undefined }, { onSuccess: () => toast.success('Enquiry closed'), onError: (x) => toast.error(errorMessage(x)) })} />
                  </View>
                </Card>
                <Card accent="primary" style={{ gap: spacing.md }}>
                  <Label color="primaryBright">Convert to customer job</Label>
                  <SelectField label="Service type" value={conv.serviceTypeId || undefined} onChange={(v) => setConv({ ...conv, serviceTypeId: v })} options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
                  <TextField label="Site address" value={conv.siteAddress} onChangeText={(v) => setConv({ ...conv, siteAddress: v })} icon="map-pin" />
                  <TextField label="Job description (defaults to the message)" value={conv.description} onChangeText={(v) => setConv({ ...conv, description: v })} multiline maxLength={2000} />
                  <Checkbox checked={conv.createCustomerIfMissing} onChange={(v) => setConv({ ...conv, createCustomerIfMissing: v })} label="Create a customer account if none matches this email (the customer receives a secure password-setup link)." />
                  <Button label="Convert to job" icon="git-pull-request" loading={convert.isPending} disabled={!conv.serviceTypeId || conv.siteAddress.trim().length < 5} onPress={() => convert.mutate({ ...conv, description: conv.description || undefined }, {
                    onSuccess: (r) => { toast.success(`Job ${r.jobReference} created${r.customerProvisioned ? ' · customer invited' : ''}`); router.replace(`/admin/job/${r.jobId}`); },
                    onError: (x) => toast.error(errorMessage(x)),
                  })} />
                </Card>
              </>
            )}
          </>
        )}
      </Screen>
    </View>
  );
}
