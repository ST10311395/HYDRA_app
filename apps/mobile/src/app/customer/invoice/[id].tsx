import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { errorMessage, newIdempotencyKey } from '../../../api/client';
import { useInvoice, usePaymentStatus, usePublicContent, useStartPayment } from '../../../api/queries';
import { InvoiceBreakdown } from '../../../components/jobs';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Icon, KeyValue, Label, Segmented, Text, TextField, colors, spacing, toast } from '../../../design-system';
import { fmtDate, invoiceTone, money } from '../../../utils/format';
import { InvoicePdfButton } from '../../../features/InvoicePdfButton';
import { QueryFallback } from '../../../components/QueryState';

/**
 * Invoice & payment (PDF Story 12). Payment happens on the gateway’s hosted page (PCI scope stays with
 * the gateway); the invoice only changes once the signed webhook is processed server-side.
 */
const PAYMENT_RETURN_URL = 'hydra://payments/complete';

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const inv = useInvoice(id);
  const start = useStartPayment();
  const [mode, setMode] = useState<'FULL' | 'PART'>('FULL');
  const [amount, setAmount] = useState('');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const status = usePaymentStatus(paymentId);
  // Server truth about the gateway: the dev simulator and Paystack test keys move no real money.
  const gatewayMode = usePublicContent().data?.paymentMode;
  const practice = gatewayMode === 'simulated' || gatewayMode === 'test';
  // A checkout is active until the gateway reports a final outcome for it.
  const activePayment = !!paymentId && (!status.data || status.data.status === 'PENDING');
  const i = inv.data;
  const payable = !!i && ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status) && i.amountDue > 0;

  useEffect(() => {
    const s = status.data?.status;
    if (!s || s === 'PENDING') return;
    void qc.invalidateQueries({ queryKey: ['invoice', id] });
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['rewards'] });
    if (s === 'SUCCEEDED') toast.success(status.data?.provider === 'simulated' ? 'Simulated payment recorded — no real money moved.' : 'Payment confirmed — thank you!');
    else toast.error('The payment was not completed. You can try again.');
    key.current = newIdempotencyKey();
  }, [status.data?.status, status.data?.provider, qc, id]);

  const pay = async () => {
    if (!i) return;
    const value = mode === 'PART' ? Number(amount.replace(',', '.')) : undefined;
    if (mode === 'PART' && (!value || value < 1 || value > i.amountDue)) {
      toast.error(`Enter an amount between R1 and ${money(i.amountDue)}`);
      return;
    }
    try {
      const p = await start.mutateAsync({ invoiceId: i.id, amount: value, key: key.current });
      setPaymentId(p.id);
      // Auth session closes automatically when the gateway redirects to PAYMENT_CALLBACK_URL.
      if (p.checkoutUrl) await WebBrowser.openAuthSessionAsync(p.checkoutUrl, PAYMENT_RETURN_URL, { toolbarColor: colors.background });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Invoice" back />
      <Screen withTabBar={false} onRefresh={() => void inv.refetch()} refreshing={inv.isRefetching}>
        {!i ? <QueryFallback query={inv} count={2} /> : (
          <>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="mono" color="primaryBright">{i.number}</Text>
                <Badge label={i.status.replace('_', ' ')} tone={invoiceTone(i.status)} />
              </View>
              <KeyValue label="Job" value={i.jobReference} mono />
              <KeyValue label="Issued" value={fmtDate(i.invoiceDate)} />
              <KeyValue label="Due" value={fmtDate(i.dueDate)} valueColor={i.status === 'OVERDUE' ? 'dangerBright' : 'text'} />
              <Button label="View job" variant="ghost" size="sm" fullWidth={false} onPress={() => router.push(`/customer/job/${i.jobId}`)} />
              <InvoicePdfButton invoiceId={i.id} />
            </Card>
            <Card style={{ gap: spacing.md }}>
              <Label>Line items</Label>
              <InvoiceBreakdown invoice={i} />
            </Card>

            {payable ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <Label color="primaryBright">{practice ? 'Pay (test mode)' : 'Pay securely'}</Label>
                {practice ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }} testID="payment-test-mode">
                    <Icon name="alert-triangle" size={16} color="warning" />
                    <Text variant="bodySmall" color="warning" style={{ flex: 1 }}>
                      {gatewayMode === 'simulated'
                        ? 'Development mode: this opens a simulated checkout. No real money moves and no card is charged.'
                        : 'Test mode: payments use the gateway’s test environment. No real money moves.'}
                    </Text>
                  </View>
                ) : null}
                <Segmented value={mode} onChange={setMode} options={[{ value: 'FULL', label: `Full ${money(i.amountDue)}` }, { value: 'PART', label: 'Part payment' }]} />
                {mode === 'PART' ? <TextField label="Amount (ZAR)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="e.g. 1500" icon="dollar-sign" /> : null}
                {activePayment && status.data?.status === 'PENDING' ? (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Icon name="loader" size={16} color="primaryBright" />
                    <Text variant="bodySmall" color="textSecondary">Waiting for payment confirmation from the gateway…</Text>
                  </View>
                ) : null}
                <Button label={activePayment ? 'Resume payment' : 'Pay now'} icon="lock" loading={start.isPending} onPress={() => void pay()} haptic testID="pay-now" />
                <Text variant="caption" color="textMuted">You’ll be taken to the payment gateway. Rewards points are credited once the invoice is fully paid.</Text>
                <Button label="Use reward points" variant="ghost" icon="gift" onPress={() => router.navigate('/customer/rewards')} />
              </Card>
            ) : i.status === 'PAID' ? (
              <Card accent="success" style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <Icon name="check-circle" size={24} color="success" />
                <Text variant="title" weight="bold" style={{ flex: 1 }}>Paid in full{i.paidAt ? ` on ${fmtDate(i.paidAt)}` : ''}. Thank you!</Text>
              </Card>
            ) : null}

            {i.payments.length ? (
              <Card style={{ gap: spacing.sm }}>
                <Label>Payments</Label>
                {i.payments.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text variant="bodySmall" weight="semibold">{money(p.amount)} · {p.method}</Text>
                      <Text variant="caption" color="textMuted">{fmtDate(p.paidAt ?? p.createdAt)}{p.providerReference ? ` · ${p.providerReference}` : ''}</Text>
                    </View>
                    <Badge label={p.status} tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'} />
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
