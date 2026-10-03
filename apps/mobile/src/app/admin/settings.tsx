import { useState } from 'react';
import { View } from 'react-native';
import type { MessageChannel, SettingsDto } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { useSettings, useSimpleMutation } from '../../api/queries';
import { parseAmount, useIsOwner } from '../../components/admin';
import { BrandHeader, Screen } from '../../components/layout';
import { Badge, Button, Card, Checkbox, KeyValue, Label, Segmented, Text, TextField, colors, spacing, toast } from '../../design-system';
import { useSyncFrom } from '../../hooks/useSyncFrom';
import { QueryFallback } from '../../components/QueryState';

/** Business settings and integration status. Viewing: office + owner; editing: owner only (server-enforced). */
export default function Settings() {
  const owner = useIsOwner();
  const q = useSettings();
  const s = q.data;
  const [f, setF] = useState({ missedCallAutomationEnabled: false, missedCallAutoReplyTemplate: '', missedCallDefaultChannel: 'SMS' as MessageChannel, rewardsRandPerPoint: '', vatRate: '', payrollRequirePaidInvoice: true, invoiceIncludeMaterialVariance: false, lowStockAlertsEnabled: true });
  useSyncFrom(s, (x) =>
    setF({
        missedCallAutomationEnabled: x.missedCallAutomationEnabled, missedCallAutoReplyTemplate: x.missedCallAutoReplyTemplate, missedCallDefaultChannel: x.missedCallDefaultChannel,
        rewardsRandPerPoint: String(x.rewardsRandPerPoint), vatRate: String(Math.round(x.vatRate * 1000) / 10), payrollRequirePaidInvoice: x.payrollRequirePaidInvoice,
        invoiceIncludeMaterialVariance: x.invoiceIncludeMaterialVariance, lowStockAlertsEnabled: x.lowStockAlertsEnabled,
    }),
  );
  const save = useSimpleMutation((body: object) => api.patch<SettingsDto>('/settings', body), [['settings'], ['missed-calls']]);
  const vat = parseAmount(f.vatRate);
  const rpp = parseAmount(f.rewardsRandPerPoint);
  const valid = Number.isFinite(vat) && vat >= 0 && vat <= 30 && Number.isFinite(rpp) && rpp >= 1 && rpp <= 1000;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Settings" back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
        footer={owner && s ? <Button label="Save settings" icon="save" disabled={!valid} loading={save.isPending} onPress={() => save.mutate(
          { ...f, rewardsRandPerPoint: rpp, vatRate: Math.round(vat * 10) / 1000 },
          { onSuccess: () => toast.success('Settings saved'), onError: (e) => toast.error(errorMessage(e)) },
        )} /> : undefined}>
        {!s ? <QueryFallback query={q} /> : (
          <>
            {!owner ? <Text variant="bodySmall" color="textMuted">You can view the configuration. Only the owner can change it.</Text> : null}
            <Card style={{ gap: 4 }}>
              <Label>Integrations</Label>
              <Integration label="Google Sign-In" ok={s.integrations.googleSignIn} value={s.integrations.googleSignIn ? 'Configured' : 'Client IDs not set'} />
              <Integration label="Payments" ok={s.integrations.payments !== 'simulated'} value={s.integrations.payments === 'simulated' ? 'Sandbox simulator (dev)' : s.integrations.payments} />
              <Integration label="File storage" ok={s.integrations.storage !== 'local'} value={s.integrations.storage === 'local' ? 'Local disk (dev)' : s.integrations.storage} />
              <Integration label="SMS" ok={s.integrations.sms} value={s.integrations.sms ? 'Twilio configured' : 'Not configured'} />
              <Integration label="WhatsApp" ok={s.integrations.whatsapp} value={s.integrations.whatsapp ? 'Configured' : 'Not configured'} />
              <Integration label="Push notifications" ok={s.integrations.push} value={s.integrations.push ? 'Expo push' : 'Disabled'} />
              <Integration label="Email" ok={s.integrations.email !== 'console'} value={s.integrations.email === 'console' ? 'Console outbox (dev)' : s.integrations.email} />
              <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>Credentials are stored in Azure Key Vault / App Service settings and are never shown in the app.</Text>
            </Card>

            <Card style={{ gap: spacing.md }}>
              <Label>Finance</Label>
              <TextField label="VAT rate (%)" value={f.vatRate} onChangeText={(v) => setF({ ...f, vatRate: v })} keyboardType="decimal-pad" editable={owner} error={Number.isFinite(vat) && vat > 30 ? 'Max 30%' : undefined} />
              <TextField label="Rewards: rand spent per point" value={f.rewardsRandPerPoint} onChangeText={(v) => setF({ ...f, rewardsRandPerPoint: v })} keyboardType="decimal-pad" editable={owner} helper="1 point is earned per this many rand of paid invoices." />
              <Toggle owner={owner} checked={f.invoiceIncludeMaterialVariance} onChange={(v) => setF({ ...f, invoiceIncludeMaterialVariance: v })} label="Always include actual material variance on invoices" />
              <Toggle owner={owner} checked={f.payrollRequirePaidInvoice} onChange={(v) => setF({ ...f, payrollRequirePaidInvoice: v })} label="Hold payroll for job timesheets until the job invoice is paid (cash-flow rule)" />
            </Card>

            <Card style={{ gap: spacing.md }}>
              <Label>Inventory</Label>
              <Toggle owner={owner} checked={f.lowStockAlertsEnabled} onChange={(v) => setF({ ...f, lowStockAlertsEnabled: v })} label="Notify admins when stock reaches the reorder level" />
            </Card>

            <Card style={{ gap: spacing.md }}>
              <Label>Missed-call automation</Label>
              <Toggle owner={owner} checked={f.missedCallAutomationEnabled} onChange={(v) => setF({ ...f, missedCallAutomationEnabled: v })} label="Enable missed-call monitoring and automatic replies (feature flag)" />
              <Text variant="title" weight="bold">Default channel</Text>
              <Segmented value={f.missedCallDefaultChannel} onChange={(v) => owner && setF({ ...f, missedCallDefaultChannel: v })} options={[{ value: 'SMS', label: 'SMS' }, { value: 'WHATSAPP', label: 'WhatsApp' }]} />
              <TextField label="Auto-reply template" value={f.missedCallAutoReplyTemplate} onChangeText={(v) => setF({ ...f, missedCallAutoReplyTemplate: v })} multiline maxLength={480} editable={owner} helper="{{name}} is replaced with the caller's first name. Sent automatically to known customers; callers with an open job get a live status update instead; unknown callers go to human review." />
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}

function Integration({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: spacing.sm }}>
      <View style={{ flex: 1 }}><KeyValue label={label} value={value} valueColor={ok ? 'text' : 'textMuted'} /></View>
      <Badge label={ok ? 'LIVE' : 'DEV'} tone={ok ? 'success' : 'warning'} />
    </View>
  );
}

function Toggle({ owner, checked, onChange, label }: { owner: boolean; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <Checkbox checked={checked} onChange={(v) => owner && onChange(v)} label={label} />;
}
