import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { MessageChannel, MissedCallDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useMissedCall, useSettings, useSimpleMutation } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, KeyValue, Label, Segmented, Text, TextField, colors, confirm, spacing, toast } from '../../../design-system';
import { MISSED_TONE, fmtDateTime } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { callNumber } from '../../../utils/links';
import { QueryFallback } from '../../../components/QueryState';

/** Human-in-the-loop review of a missed call: approve/edit the suggested reply, call back, or dismiss. */
export default function MissedCallDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useMissedCall(id);
  const settings = useSettings();
  const c = q.data;
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<MessageChannel>('SMS');
  const [reason, setReason] = useState('');
  // Seed the reply once per call: the server's suggested reply, else the business template.
  useSyncFrom(c && (c.suggestedReply || settings.data) ? c.id : undefined, () => setMessage(c?.suggestedReply ?? settings.data?.missedCallAutoReplyTemplate ?? ''));
  useSyncFrom(settings.data?.missedCallDefaultChannel, setChannel);

  const keys = [['missed-call', id], ['missed-calls'], ['message-logs'], ['dashboard']];
  const reply = useSimpleMutation((body: object) => api.post<{ missedCall: MissedCallDto; delivery: string }>(`/missed-calls/${id}/reply`, body), keys);
  const dismiss = useSimpleMutation((body: object) => api.post<MissedCallDto>(`/missed-calls/${id}/dismiss`, body), keys);
  const channelConfigured = channel === 'SMS' ? settings.data?.integrations.sms : settings.data?.integrations.whatsapp;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Missed Call" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!c ? <QueryFallback query={q} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="h2">{c.contactName ?? c.phoneNumber}</Text>
                <Badge label={c.status.replace('_', ' ')} tone={MISSED_TONE[c.status]} />
              </View>
              <KeyValue label="Number" value={c.phoneNumber} mono />
              <KeyValue label="Called" value={fmtDateTime(c.callAt)} />
              <KeyValue label="Rang for" value={`${c.durationSeconds}s`} />
              <KeyValue label="Source" value={c.source === 'DEVICE_MONITOR' ? 'Work phone monitor' : 'Manual entry'} />
              <KeyValue label="Classification" value={c.classification ? c.classification.replace(/_/g, ' ').toLowerCase() : '—'} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Call back" icon="phone" size="sm" style={{ flex: 1 }} onPress={() => void callNumber(c.phoneNumber)} />
                {c.linkedCustomerId ? <Button label="Customer" icon="user" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/admin/customer/${c.linkedCustomerId}`)} /> : null}
              </View>
            </Card>

            {c.status !== 'DISMISSED' ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <Label color="primaryBright">Send a reply</Label>
                <Segmented value={channel} onChange={setChannel} options={[{ value: 'SMS', label: 'SMS' }, { value: 'WHATSAPP', label: 'WhatsApp' }]} />
                {!channelConfigured ? <Text variant="caption" color="warning">{channel === 'SMS' ? 'SMS' : 'WhatsApp'} provider is not configured — the message will be logged as NOT CONFIGURED and not delivered. Call the customer instead.</Text> : null}
                <TextField label="Message" value={message} onChangeText={setMessage} multiline maxLength={480} helper={`${message.length}/480`} />
                <Button label="Approve & send" icon="send" disabled={message.trim().length < 5} loading={reply.isPending} onPress={() => reply.mutate({ message: message.trim(), channel }, {
                  onSuccess: (r) => toast[r.delivery === 'SENT' ? 'success' : 'info'](r.delivery === 'SENT' ? 'Reply sent' : `Delivery status: ${r.delivery.replace('_', ' ').toLowerCase()}`),
                  onError: (e) => toast.error(errorMessage(e)),
                })} />
                <TextField placeholder="Dismiss reason (optional)" value={reason} onChangeText={setReason} maxLength={300} />
                <Button label="Dismiss without reply" icon="x" variant="outline" loading={dismiss.isPending} onPress={() => void (async () => {
                  if (!(await confirm({ title: 'Dismiss this missed call?', message: 'No message will be sent. This is recorded in the audit log.', confirmLabel: 'Dismiss' }))) return;
                  dismiss.mutate({ reason: reason.trim() || undefined }, { onSuccess: () => toast.success('Dismissed'), onError: (e) => toast.error(errorMessage(e)) });
                })()} />
              </Card>
            ) : null}

            <Card style={{ gap: spacing.sm }}>
              <Label>Messages</Label>
              {c.messages.length === 0 ? <Text variant="bodySmall" color="textMuted">No messages sent for this call.</Text> : c.messages.map((m) => (
                <View key={m.id} style={{ gap: 2, paddingVertical: 6, borderBottomWidth: 0.5, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" color="textSecondary">{m.channel} · {fmtDateTime(m.sentAt ?? m.createdAt)}</Text>
                    <Badge label={m.deliveryStatus.replace('_', ' ')} tone={m.deliveryStatus === 'SENT' || m.deliveryStatus === 'DELIVERED' ? 'success' : m.deliveryStatus === 'FAILED' ? 'danger' : 'warning'} />
                  </View>
                  <Text variant="bodySmall">{m.messageContent}</Text>
                  <Text variant="caption" color="textFaint">{m.approvedByName ? `Approved by ${m.approvedByName}` : 'Automatic reply'}{m.errorMessage ? ` · ${m.errorMessage}` : ''}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}
