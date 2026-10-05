import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { flatten, useInvoices, usePayments } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, EmptyState, FilterChips, Label, Text, colors, spacing } from '../../../design-system';
import { fmtDate, invoiceTone, money } from '../../../utils/format';
import { QueryFallback, notReady } from '../../../components/QueryState';

export default function BillingScreen() {
  const [tab, setTab] = useState<'INVOICES' | 'PAYMENTS'>('INVOICES');
  const invoices = useInvoices();
  const payments = usePayments();
  const list = flatten(invoices.data);
  const outstanding = list.filter((i) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status)).reduce((a, i) => a + i.amountDue, 0);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Billing" />
      <Screen onRefresh={() => void Promise.all([invoices.refetch(), payments.refetch()])} refreshing={invoices.isRefetching}>
        <Card accent={outstanding > 0 ? 'primary' : 'success'} style={{ gap: 4 }}>
          <Label>Outstanding balance</Label>
          <Text variant="stat" color={outstanding > 0 ? 'warning' : 'success'}>{money(outstanding)}</Text>
          <Text variant="caption" color="textMuted">Card details are entered on the secure payment gateway — never stored by HYDRA.</Text>
        </Card>
        <FilterChips value={tab} onChange={setTab} options={[{ value: 'INVOICES', label: 'Invoices', icon: 'file-text' }, { value: 'PAYMENTS', label: 'Payment history', icon: 'clock' }]} />
        {tab === 'INVOICES' ? (
          notReady(invoices) ? <QueryFallback query={invoices} /> : list.length === 0 ? (
            <EmptyState icon="file-text" title="No invoices yet" message="Invoices appear once a job is completed and certified." />
          ) : (
            list.map((i) => (
              <Card key={i.id} onPress={() => router.push(`/customer/invoice/${i.id}`)} accent={i.status === 'OVERDUE' ? 'danger' : 'none'} accessibilityLabel={`Invoice ${i.number}`} style={{ gap: 6 }}>
                <View style={styles.between}>
                  <Text variant="mono" color="primaryBright">{i.number}</Text>
                  <Badge label={i.status.replace('_', ' ')} tone={invoiceTone(i.status)} />
                </View>
                <Text variant="bodySmall" color="textMuted">Job {i.jobReference} · issued {fmtDate(i.invoiceDate)}</Text>
                <View style={styles.between}>
                  <Text variant="caption" color="textMuted">Total {money(i.total)}</Text>
                  <Text variant="h3" color={i.amountDue > 0 ? 'warning' : 'success'}>{i.amountDue > 0 ? `${money(i.amountDue)} due` : 'Paid'}</Text>
                </View>
              </Card>
            ))
          )
        ) : flatten(payments.data).length === 0 ? (
          <EmptyState icon="credit-card" title="No payments yet" />
        ) : (
          flatten(payments.data).map((p) => (
            <Card key={p.id} style={{ gap: 4 }}>
              <View style={styles.between}>
                <Text variant="title" weight="bold">{money(p.amount)}</Text>
                <Badge label={p.status} tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'} />
              </View>
              <Text variant="caption" color="textMuted">{p.invoiceNumber} · {p.method} via {p.provider} · {fmtDate(p.paidAt ?? p.createdAt)}</Text>
              {p.providerReference ? <Text variant="mono" color="textMuted" style={{ fontSize: 11 }}>Ref {p.providerReference}</Text> : null}
            </Card>
          ))
        )}
        {tab === 'INVOICES' && invoices.hasNextPage ? <Button label="Load more" variant="ghost" onPress={() => void invoices.fetchNextPage()} /> : null}
        {tab === 'PAYMENTS' && payments.hasNextPage ? <Button label="Load more" variant="ghost" onPress={() => void payments.fetchNextPage()} /> : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({ between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm } });
