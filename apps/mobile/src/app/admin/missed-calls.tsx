/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import type { MessageLogDto, MissedCallDto, MissedCallStatus } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { flatten, useMessageLogs, useMissedCalls, useMissedStatus, useSettings, useSimpleMutation } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Button, Card, Checkbox, DateField, FilterChips, KeyValue, Label, Segmented, Text, TextField, spacing, toast } from '../../design-system';
import { syncMissedCalls } from '../../features/missedCallSync';
import { MISSED_TONE, fmtDateTime, sastInstant, todayIso } from '../../utils/format';
import { hasCallLogPermission, isMissedCallMonitorAvailable, requestCallLogPermission } from '../../../modules/missed-call-monitor';

type Filter = 'ALL' | MissedCallStatus;

/**
 * Missed-call workflow (spec §11, PDF Story 20). Android work phones can sync the call log after an
 * explicit consent disclosure; any admin can log a call manually. iOS cannot read call logs.
 */
export default function MissedCalls() {
  const [tab, setTab] = useState<'CALLS' | 'MESSAGES'>('CALLS');
  const [status, setStatus] = useState<Filter>('ALL');
  const calls = useMissedCalls({ status: status === 'ALL' ? undefined : status });
  const messages = useMessageLogs();

  const header = (
    <>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'CALLS', label: 'Missed calls' }, { value: 'MESSAGES', label: 'Message log' }]} />
      {tab === 'CALLS' ? (
        <>
          <MonitorPanel />
          <ManualLog />
          <FilterChips value={status} onChange={setStatus} options={[{ value: 'ALL', label: 'All' }, { value: 'REVIEW_REQUIRED', label: 'Needs review' }, { value: 'AUTO_REPLIED', label: 'Auto-replied' }, { value: 'REPLIED', label: 'Replied' }, { value: 'FAILED', label: 'Failed' }, { value: 'DISMISSED', label: 'Dismissed' }]} />
        </>
      ) : <Text variant="caption" color="textMuted">Every outgoing automated or approved message with its delivery status (AI_MESSAGE_LOG). Messages are never marked sent unless the provider accepted them.</Text>}
    </>
  );

  if (tab === 'MESSAGES') {
    return (
      <AdminList<MessageLogDto>
        section="Missed Calls"
        header={header}
        items={flatten(messages.data)}
        query={messages}
        emptyIcon="message-square"
        emptyTitle="No messages sent yet"
        renderItem={({ item: m }) => (
          <Card onPress={m.missedCallId ? () => router.push(`/admin/missed-call/${m.missedCallId}`) : undefined} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="mono" color="textSecondary">{m.channel} → {m.recipient}</Text>
              <Badge label={m.deliveryStatus.replace('_', ' ')} tone={m.deliveryStatus === 'DELIVERED' || m.deliveryStatus === 'SENT' ? 'success' : m.deliveryStatus === 'FAILED' ? 'danger' : 'warning'} />
            </View>
            <Text variant="bodySmall" color="textSecondary">{m.messageContent}</Text>
            <Text variant="caption" color="textFaint">{fmtDateTime(m.sentAt ?? m.createdAt)}{m.approvedByName ? ` · approved by ${m.approvedByName}` : ' · automatic'}{m.errorMessage ? ` · ${m.errorMessage}` : ''}</Text>
          </Card>
        )}
      />
    );
  }

  return (
    <AdminList<MissedCallDto>
      section="Missed Calls"
      header={header}
      items={flatten(calls.data)}
      query={calls}
      emptyIcon="phone-missed"
      emptyTitle="No missed calls"
      renderItem={({ item: c }) => (
        <Card onPress={() => router.push(`/admin/missed-call/${c.id}`)} accent={c.status === 'REVIEW_REQUIRED' ? 'primary' : c.status === 'FAILED' ? 'danger' : 'none'} accessibilityLabel={`Missed call from ${c.contactName ?? c.phoneNumber}, ${c.status}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="title" weight="bold">{c.contactName ?? c.phoneNumber}</Text>
            <Badge label={c.status.replace('_', ' ')} tone={MISSED_TONE[c.status]} />
          </View>
          <Text variant="caption" color="textMuted">{c.contactName ? `${c.phoneNumber} · ` : ''}{fmtDateTime(c.callAt)} · {c.source === 'DEVICE_MONITOR' ? 'work phone' : 'logged manually'}</Text>
          {c.classification ? <Text variant="caption" color="secondaryBright">{c.classification.replace(/_/g, ' ').toLowerCase()}</Text> : null}
        </Card>
      )}
    />
  );
}

function MonitorPanel() {
  const status = useMissedStatus();
  const settings = useSettings();
  const [consentOpen, setConsentOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [permission, setPermission] = useState(hasCallLogPermission());
  const consent = useSimpleMutation((granted: boolean) => api.post<{ granted: boolean }>('/missed-calls/consent', { granted }), [['missed-calls']]);
  const s = status.data;
  const deviceCapable = isMissedCallMonitorAvailable();

  const grant = async () => {
    try {
      await consent.mutateAsync(true);
      const ok = await requestCallLogPermission();
      setPermission(ok);
      toast[ok ? 'success' : 'info'](ok ? 'Monitoring enabled on this device' : 'Consent saved. Call-log permission was not granted — you can still log calls manually.');
      setConsentOpen(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await syncMissedCalls();
      toast.success(r.found === 0 ? 'No new missed calls' : `${r.logged} logged · ${r.skipped} skipped`);
      await status.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Label>Automation status</Label>
      <KeyValue label="Feature flag" value={s?.featureEnabled ? 'Enabled' : 'Disabled'} valueColor={s?.featureEnabled ? 'success' : 'textMuted'} />
      <KeyValue label="SMS provider" value={s?.smsConfigured ? 'Configured' : 'Not configured'} valueColor={s?.smsConfigured ? 'success' : 'warning'} />
      <KeyValue label="WhatsApp provider" value={s?.whatsappConfigured ? 'Configured' : 'Not configured'} valueColor={s?.whatsappConfigured ? 'success' : 'warning'} />
      <KeyValue label="Default channel" value={settings.data?.missedCallDefaultChannel ?? '—'} />
      <KeyValue label="My consent" value={s?.consentGranted ? 'Given' : 'Not given'} valueColor={s?.consentGranted ? 'success' : 'textMuted'} />
      <KeyValue label="This device" value={Platform.OS === 'ios' ? 'iOS — not supported by the OS' : deviceCapable ? (permission ? 'Call-log permission granted' : 'Permission not granted') : 'Admin Android build required'} />
      {!s?.featureEnabled ? <Text variant="caption" color="textMuted">The owner can enable automation in Settings. Manual logging and human-approved replies still work.</Text> : null}

      {s?.featureEnabled && deviceCapable && !s.consentGranted ? (
        consentOpen ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="bodySmall" color="textSecondary">
              With your consent, this work phone reads only <Text variant="bodySmall" weight="bold">missed</Text> calls (number, time and ring duration) when you tap “Sync”.
              HYDRA never reads contacts, call recordings or answered/outgoing calls, and nothing is collected in the background. Numbers are stored in the
              HYDRA database so the office can reply; automatic replies go only to existing customers — unknown callers are held for office review. You can withdraw consent at any time.
            </Text>
            <Checkbox checked={ack} onChange={setAck} label="I understand and consent on behalf of this business work phone (POPIA)." />
            <Button label="Give consent & request permission" icon="check" disabled={!ack} loading={consent.isPending} onPress={() => void grant()} />
          </View>
        ) : <Button label="Set up monitoring on this phone" icon="smartphone" variant="violet" onPress={() => setConsentOpen(true)} />
      ) : null}
      {s?.featureEnabled && deviceCapable && s.consentGranted ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {permission ? <Button label="Sync missed calls" icon="refresh-cw" size="sm" style={{ flex: 1 }} loading={syncing} onPress={() => void sync()} /> : (
            <Button label="Grant call-log permission" icon="unlock" size="sm" style={{ flex: 1 }} onPress={() => void requestCallLogPermission().then(setPermission)} />
          )}
          <Button label="Withdraw consent" size="sm" variant="dangerOutline" style={{ flex: 1 }} loading={consent.isPending} onPress={() => consent.mutate(false, { onSuccess: () => toast.success('Consent withdrawn — monitoring stopped'), onError: (e) => toast.error(errorMessage(e)) })} />
        </View>
      ) : null}
    </Card>
  );
}

function ManualLog() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ phoneNumber: '', date: todayIso(), time: '', duration: '0' });
  const log = useSimpleMutation((body: object) => api.post<MissedCallDto>('/missed-calls', body), [['missed-calls'], ['message-logs'], ['dashboard']]);
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(f.time);
  if (!open) return <Button label="Log a missed call manually" icon="plus" size="sm" variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <Card accent="primary" style={{ gap: spacing.md }}>
      <Label color="primaryBright">Manual missed-call entry</Label>
      <TextField label="Caller number" value={f.phoneNumber} onChangeText={(v) => setF({ ...f, phoneNumber: v })} keyboardType="phone-pad" maxLength={24} placeholder="082 000 0000" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 3 }}><DateField label="Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></View>
        <View style={{ flex: 2 }}><TextField label="Time" value={f.time} onChangeText={(v) => setF({ ...f, time: v })} placeholder="14:30" maxLength={5} error={f.time && !validTime ? 'HH:MM' : undefined} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button label="Log call" style={{ flex: 1 }} disabled={f.phoneNumber.replace(/\D/g, '').length < 9 || !validTime} loading={log.isPending} onPress={() => log.mutate(
          { phoneNumber: f.phoneNumber.trim(), callAt: sastInstant(f.date, f.time), durationSeconds: Number(f.duration) || 0, source: 'MANUAL' },
          { onSuccess: (c) => { toast.success(c.status === 'AUTO_REPLIED' ? 'Logged — automatic reply sent' : 'Logged — needs review'); setOpen(false); setF({ ...f, phoneNumber: '', time: '' }); router.push(`/admin/missed-call/${c.id}`); }, onError: (e) => toast.error(errorMessage(e)) },
        )} />
      </View>
    </Card>
  );
}
