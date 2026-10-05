import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { InvoiceDto, PaymentMethod } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useInvoice, useSimpleMutation } from '../../../api/queries';
import { parseAmount } from '../../../components/admin';
import { InvoiceBreakdown, PersonRow } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, DateField, KeyValue, Label, Segmented, Text, TextField, colors, confirm, spacing, toast } from '../../../design-system';
import { fmtDate, fmtDateTime, invoiceTone, money, todayIso } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { InvoicePdfButton } from '../../../features/InvoicePdfButton';
import { QueryFallback } from '../../../components/QueryState';

/** Admin invoice detail: send draft, delete draft, record offline payments, payment history. */
export default function AdminInvoice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useInvoice(id);
  const inv = q.data;
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: 'EFT' as PaymentMethod, reference: '', paidOn: todayIso() });
  useSyncFrom(inv?.amountDue, (due) => setPay((p) => ({ ...p, amount: due > 0 ? due.toFixed(2) : '' })));

  const keys = [['invoice', id], ['invoices'], ['jobs'], ['job'], ['dashboard'], ['payments']];
  const send = useSimpleMutation(() => api.post<InvoiceDto>(`/invoices/${id}/send`), keys);
  const remove = useSimpleMutation(() => api.delete<void>(`/invoices/${id}`), keys);
  const manual = useSimpleMutation((body: object) => api.post<InvoiceDto>(`/invoices/${id}/manual-payments`, body), keys);

  const amount = parseAmount(pay.amount);
  const payValid = inv && Number.isFinite(amount) && amount > 0 && amount <= inv.amountDue && pay.reference.trim().length >= 3;
  const payable = inv && ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={inv ? inv.number : 'Invoice'} back />
      <Screen withTabBar={false} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
        {!inv ? <QueryFallback query={q} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="mono" color="primaryBright">{inv.number}</Text>
                <Badge label={inv.status.replace('_', ' ')} tone={invoiceTone(inv.status)} />
              </View>
              <Text variant="h1" color={inv.amountDue > 0 ? 'warning' : 'success'}>{money(inv.amountDue)}</Text>
              <Text variant="caption" color="textMuted">outstanding of {money(inv.total)}</Text>
              <KeyValue label="Issued" value={fmtDate(inv.invoiceDate)} />
              <KeyValue label="Due" value={fmtDate(inv.dueDate)} valueColor={inv.status === 'OVERDUE' ? 'dangerBright' : 'text'} />
              {inv.sentAt ? <KeyValue label="Sent" value={fmtDateTime(inv.sentAt)} /> : null}
              {inv.paidAt ? <KeyValue label="Paid in full" value={fmtDateTime(inv.paidAt)} valueColor="success" /> : null}
              <Button label={`Job ${inv.jobReference}`} icon="briefcase" variant="secondary" size="sm" onPress={() => router.push(`/admin/job/${inv.jobId}`)} />
            </Card>

            <Card><PersonRow icon="user" title="Bill to" name={inv.customer.name} phone={inv.customer.phone} /><Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>{inv.customer.email}</Text></Card>

            <Card style={{ gap: spacing.sm }}>
              <Label>Line items</Label>
              <InvoiceBreakdown invoice={inv} />
              {inv.notes ? <Text variant="caption" color="textMuted">{inv.notes}</Text> : null}
            </Card>

            {inv.status === 'DRAFT' ? (
              <Card accent="primary" style={{ gap: spacing.sm }}>
                <Text variant="bodySmall" color="textMuted">This invoice is a draft and has not been sent to the customer.</Text>
                <Button label="Send to customer" icon="send" loading={send.isPending} onPress={() => send.mutate(undefined, { onSuccess: () => toast.success('Invoice sent'), onError: (e) => toast.error(errorMessage(e)) })} />
                <Button label="Delete draft" icon="trash-2" variant="dangerOutline" loading={remove.isPending} onPress={() => void (async () => {
                  if (!(await confirm({ title: 'Delete draft invoice?', message: 'The job returns to “to invoice”. This is recorded in the audit log.', confirmLabel: 'Delete', destructive: true }))) return;
                  remove.mutate(undefined, { onSuccess: () => { toast.success('Draft deleted'); router.back(); }, onError: (e) => toast.error(errorMessage(e)) });
                })()} />
              </Card>
            ) : null}

            {payable ? (
              payOpen ? (
                <Card accent="primary" style={{ gap: spacing.md }}>
                  <Label color="primaryBright">Record EFT / cash payment</Label>
                  <TextField label="Amount (R)" value={pay.amount} onChangeText={(v) => setPay({ ...pay, amount: v })} keyboardType="decimal-pad"
                    error={pay.amount && (!Number.isFinite(amount) || amount <= 0 || amount > inv.amountDue) ? `Between R0.01 and ${money(inv.amountDue)}` : undefined} />
                  <Segmented value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} options={[{ value: 'EFT', label: 'EFT' }, { value: 'CASH', label: 'Cash' }, { value: 'CARD', label: 'Card (POS)' }, { value: 'OTHER', label: 'Other' }]} />
                  <TextField label="Reference" value={pay.reference} onChangeText={(v) => setPay({ ...pay, reference: v })} placeholder="Bank reference / receipt no." maxLength={80} />
                  <DateField label="Paid on" value={pay.paidOn} onChange={(v) => setPay({ ...pay, paidOn: v })} />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setPayOpen(false)} />
                    <Button label="Record" style={{ flex: 1 }} disabled={!payValid} loading={manual.isPending} onPress={() => void (async () => {
                      if (!(await confirm({ title: `Record ${money(amount)}?`, message: 'Only record money that has actually cleared. This is audited and cannot be edited.', confirmLabel: 'Record payment' }))) return;
                      manual.mutate({ amount, method: pay.method, reference: pay.reference.trim(), paidOn: pay.paidOn }, {
                        onSuccess: (r) => { toast.success(r.status === 'PAID' ? 'Invoice paid in full' : 'Partial payment recorded'); setPayOpen(false); setPay((p) => ({ ...p, amount: '', reference: '' })); },
                        onError: (e) => toast.error(errorMessage(e)),
                      });
                    })()} />
                  </View>
                </Card>
              ) : <Button label="Record offline payment" icon="dollar-sign" variant="secondary" onPress={() => setPayOpen(true)} />
            ) : null}

            <Card style={{ gap: spacing.sm }}>
              <Label>Payments</Label>
              {inv.payments.length === 0 ? <Text variant="bodySmall" color="textMuted">No payments yet.</Text> : inv.payments.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" weight="semibold">{p.method} · {p.provider}</Text>
                    <Text variant="caption" color="textMuted">{fmtDateTime(p.paidAt ?? p.createdAt)}{p.providerReference ? ` · ${p.providerReference}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="mono">{money(p.amount)}</Text>
                    <Badge label={p.status} tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'} />
                  </View>
                </View>
              ))}
            </Card>

            <InvoicePdfButton invoiceId={inv.id} />
          </>
        )}
      </Screen>
    </View>
  );
}
