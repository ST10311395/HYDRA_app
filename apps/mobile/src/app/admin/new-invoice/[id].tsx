import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { InvoiceDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useJob, useSettings, useSimpleMutation } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Button, Card, Checkbox, DateField, EmptyState, KeyValue, Label, Text, TextField, colors, spacing, toast } from '../../../design-system';
import { addDaysIso, money, todayIso } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { QueryFallback } from '../../../components/QueryState';

/** Invoice generation (spec §10.7, PDF Story 11) — only for inspection-passed COMPLETED jobs (server-enforced). */
export default function NewInvoice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const settings = useSettings();
  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 14));
  const [variance, setVariance] = useState(false);
  const [notes, setNotes] = useState('');
  const [send, setSend] = useState(true);
  useSyncFrom(settings.data?.invoiceIncludeMaterialVariance, setVariance);

  const create = useSimpleMutation((body: object) => api.post<InvoiceDto>(`/jobs/${id}/invoice`, body), [['job', id], ['jobs'], ['invoices'], ['dashboard']]);
  const j = job.data;
  const q = j?.quote;
  const diff = j && q ? j.materialsCost - q.materialsCost : 0;
  const forced = !!settings.data?.invoiceIncludeMaterialVariance;
  const eligible = j?.allowedActions.includes('GENERATE_INVOICE');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Generate Invoice" back />
      <Screen withTabBar={false} footer={eligible ? (
        <Button label={send ? 'Issue invoice' : 'Save draft invoice'} icon="file-plus" loading={create.isPending} testID="invoice-submit" onPress={() => create.mutate(
          { dueDate, includeMaterialVariance: variance, notes: notes.trim() || undefined, send },
          { onSuccess: (inv) => { toast.success(`Invoice ${inv.number} ${inv.status === 'DRAFT' ? 'saved as draft' : 'issued'}`); router.replace(`/admin/invoice/${inv.id}`); }, onError: (e) => toast.error(errorMessage(e)) },
        )} />
      ) : undefined}>
        {!j ? <QueryFallback query={job} /> : !eligible ? (
          <EmptyState icon="file-minus" title="Invoice not available" message={j.invoice ? `Invoice ${j.invoice.number} already exists for this job.` : 'Invoices can only be generated once the inspection has passed and the job is completed.'}
            action={j.invoice ? <Button label="Open invoice" fullWidth={false} onPress={() => router.replace(`/admin/invoice/${j.invoice!.id}`)} /> : undefined} />
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <Text variant="mono" color="primaryBright">{j.reference}</Text>
              <Text variant="h3">{j.serviceType.name}</Text>
              <Text variant="bodySmall" color="textMuted">{j.customer.name} · {j.siteAddress}</Text>
            </Card>
            <Card style={{ gap: 4 }}>
              <Label>Basis</Label>
              {q ? (
                <>
                  <KeyValue label={`Accepted quote v${q.version} (incl. VAT)`} value={money(q.total)} mono />
                  <KeyValue label="Quoted materials" value={money(q.materialsCost)} mono />
                  <KeyValue label="Actual materials logged" value={money(j.materialsCost)} mono />
                  <KeyValue label="Material variance (ex VAT)" value={`${diff > 0 ? '+' : ''}${money(diff)}`} valueColor={diff > 0 ? 'warning' : 'success'} mono />
                </>
              ) : <Text variant="bodySmall" color="textMuted">No accepted quote — the invoice is built from logged materials.</Text>}
              <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>Final amounts, VAT and any redeemed rewards are calculated by the server.</Text>
            </Card>
            <Card style={{ gap: spacing.md }}>
              <DateField label="Due date" value={dueDate} onChange={setDueDate} minDate={todayIso()} />
              <Checkbox checked={variance || forced} onChange={(v) => !forced && setVariance(v)} label={forced ? 'Material variance is always included (business setting)' : 'Include actual material cost variance against the quote'} />
              <TextField label="Notes on invoice (optional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
              <Checkbox checked={send} onChange={setSend} label="Send to the customer now (they are notified and can pay in the app)" />
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}
