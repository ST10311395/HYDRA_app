/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { InvoiceDto, InvoiceStatus, PaymentDto } from '@hydra/shared';
import { flatten, useInvoices, usePayments } from '../../api/queries';
import { AdminList } from '../../components/admin';
import { Badge, Card, FilterChips, SearchField, Segmented, Text, spacing } from '../../design-system';
import { fmtDate, fmtDateTime, invoiceTone, money } from '../../utils/format';

type Filter = 'ALL' | InvoiceStatus;

/** Finance: invoices and payment tracking (spec §10 “Finance”). */
export default function AdminInvoices() {
  const [tab, setTab] = useState<'INVOICES' | 'PAYMENTS'>('INVOICES');
  const [status, setStatus] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const q = useInvoices({ status: status === 'ALL' ? undefined : status, search: search.trim() || undefined });
  const payments = usePayments();
  const tabs = <Segmented value={tab} onChange={setTab} options={[{ value: 'INVOICES', label: 'Invoices' }, { value: 'PAYMENTS', label: 'Payments received' }]} />;

  if (tab === 'PAYMENTS') {
    return (
      <AdminList<PaymentDto>
        section="Finance"
        items={flatten(payments.data)}
        query={payments}
        emptyIcon="dollar-sign"
        emptyTitle="No payments yet"
        header={tabs}
        renderItem={({ item: p }) => (
          <Card onPress={() => router.push(`/admin/invoice/${p.invoiceId}`)} accessibilityLabel={`Payment ${money(p.amount)} for ${p.invoiceNumber}, ${p.status}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="mono" color="primaryBright">{p.invoiceNumber}</Text>
              <Badge label={p.status} tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text variant="caption" color="textMuted">{p.method} · {p.provider}{p.providerReference ? ` · ${p.providerReference}` : ''}</Text>
              <Text variant="mono">{money(p.amount)}</Text>
            </View>
            <Text variant="caption" color="textFaint">{fmtDateTime(p.paidAt ?? p.createdAt)}</Text>
          </Card>
        )}
      />
    );
  }

  return (
    <AdminList<InvoiceDto>
      section="Finance"
      items={flatten(q.data)}
      query={q}
      emptyIcon="file-text"
      emptyTitle="No invoices"
      emptyMessage="Invoices are generated from completed jobs under Jobs → To invoice."
      header={
        <>
          {tabs}
          <SearchField value={search} onChangeText={setSearch} placeholder="Search invoice no., customer, job…" />
          <FilterChips value={status} onChange={setStatus} options={[
            { value: 'ALL', label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'SENT', label: 'Sent' }, { value: 'PARTIALLY_PAID', label: 'Part paid' },
            { value: 'OVERDUE', label: 'Overdue' }, { value: 'PAID', label: 'Paid' }, { value: 'VOID', label: 'Void' },
          ]} />
        </>
      }
      renderItem={({ item: i }) => (
        <Card onPress={() => router.push(`/admin/invoice/${i.id}`)} accessibilityLabel={`Invoice ${i.number}, ${i.status}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="mono" color="primaryBright">{i.number}</Text>
            <Badge label={i.status.replace('_', ' ')} tone={invoiceTone(i.status)} />
          </View>
          <Text variant="title" weight="bold">{i.customer.name}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text variant="caption" color="textMuted">Job {i.jobReference} · due {fmtDate(i.dueDate)}</Text>
            <Text variant="mono" color={i.amountDue > 0 ? 'warning' : 'success'}>{money(i.amountDue > 0 ? i.amountDue : i.total)}</Text>
          </View>
        </Card>
      )}
    />
  );
}
