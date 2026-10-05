import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { calculateQuoteTotals, createQuoteSchema, type QuoteDto, type QuoteItemKind } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { useJob, useService, useSettings, useSimpleMutation } from '../../../api/queries';
import { parseAmount } from '../../../components/admin';
import { BrandHeader, Screen } from '../../../components/layout';
import { Button, Card, Checkbox, DateField, Divider, Icon, KeyValue, Label, Segmented, Text, TextField, colors, radius, spacing, toast } from '../../../design-system';
import { addDaysIso, money, todayIso } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { QueryFallback } from '../../../components/QueryState';

interface Line {
  key: string;
  kind: QuoteItemKind;
  description: string;
  quantity: string;
  unitPrice: string;
}

let seq = 0;
const newLine = (kind: QuoteItemKind, description = '', unitPrice = '', quantity = '1'): Line => ({ key: `l${++seq}`, kind, description, quantity, unitPrice });

const DEFAULT_TERMS = 'Quote valid for the period shown. 50% of materials may be requested before procurement. Workmanship guaranteed for 12 months. Prices include labour and listed materials only; additional work will be quoted separately.';

/** Quote builder (spec §10.3, PDF Story 7): structured line items, discount, validity, terms; VAT from settings. */
export default function QuoteBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const settings = useSettings();
  const service = useService(job.data?.serviceType.id ?? '');
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState('0');
  const [validUntil, setValidUntil] = useState(addDaysIso(todayIso(), 14));
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [notes, setNotes] = useState('');
  const [send, setSend] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Prefill once: previous quote (revision) or a labour line priced from the service catalogue.
  const prefillReady = !!job.data && (!!job.data.quote || !!service.data || service.isError);
  useSyncFrom(prefillReady ? job.data?.id : undefined, () => {
    if (!job.data) return;
    const prev = job.data.quote;
    if (prev) {
      setLines(prev.items.map((i) => newLine(i.kind, i.description, String(i.unitPrice), String(i.quantity))));
      setDiscount(String(prev.discountAmount));
      if (prev.terms) setTerms(prev.terms);
    } else {
      setLines([newLine('LABOUR', `Labour — ${job.data.serviceType.name}`, service.data ? String(service.data.basePrice) : '')]);
    }
  });

  const vatRate = settings.data?.vatRate ?? 0.15;
  const parsedItems = lines.map((l) => ({ kind: l.kind, description: l.description.trim(), quantity: parseAmount(l.quantity), unitPrice: parseAmount(l.unitPrice) }));
  const discountValue = parseAmount(discount);
  const totals = calculateQuoteTotals(
    parsedItems.map((i) => ({ kind: i.kind, quantity: Number.isFinite(i.quantity) ? i.quantity : 0, unitPrice: Number.isFinite(i.unitPrice) ? i.unitPrice : 0 })),
    Number.isFinite(discountValue) ? discountValue : 0,
    vatRate,
  );

  const create = useSimpleMutation((body: object) => api.post<QuoteDto>(`/jobs/${id}/quote`, body), [['job', id], ['jobs'], ['dashboard']]);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    const payload = { items: parsedItems, discountAmount: parseAmount(discount) || 0, validUntil, terms, notes, send };
    const parsed = createQuoteSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[issue.path.join('.')] ??= issue.message;
      setErrors(errs);
      toast.error(Object.values(errs)[0] ?? 'Check the quote details');
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (qd) => {
        toast.success(qd.status === 'SENT' ? `Quote v${qd.version} sent to the customer` : `Draft quote v${qd.version} saved`);
        router.back();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const j = job.data;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Quote Builder" back />
      <Screen withTabBar={false} footer={j ? <Button label={send ? `Send quote · ${money(totals.total)}` : 'Save draft'} icon={send ? 'send' : 'save'} loading={create.isPending} onPress={submit} testID="quote-submit" /> : undefined}>
        {!j ? <QueryFallback query={job} /> : (
          <>
            <Card style={{ gap: 4 }}>
              <Text variant="mono" color="primaryBright">{j.reference}</Text>
              <Text variant="h3">{j.serviceType.name}</Text>
              <Text variant="bodySmall" color="textMuted">{j.customer.name} · {j.siteAddress}</Text>
              <Text variant="caption" color="textSecondary" numberOfLines={4} style={{ marginTop: 4 }}>{j.description}</Text>
            </Card>

            <Label>Line items</Label>
            {errors.items ? <Text variant="caption" color="dangerBright">{errors.items}</Text> : null}
            {lines.map((l, idx) => (
              <Card key={l.key} style={{ gap: spacing.sm }} testID={`quote-line-${idx}`}>
                <View style={styles.between}>
                  <Text variant="caption" color="textMuted">Line {idx + 1}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove line ${idx + 1}`} hitSlop={12} disabled={lines.length === 1} onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Icon name="trash-2" size={16} color={lines.length === 1 ? 'textFaint' : 'dangerBright'} />
                  </Pressable>
                </View>
                <Segmented value={l.kind} onChange={(v) => update(l.key, { kind: v })} options={[{ value: 'LABOUR', label: 'Labour' }, { value: 'MATERIAL', label: 'Material' }, { value: 'FEE', label: 'Fee' }]} />
                <TextField placeholder="Description" value={l.description} onChangeText={(v) => update(l.key, { description: v })} maxLength={200} error={errors[`items.${idx}.description`]} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}><TextField label="Qty" value={l.quantity} onChangeText={(v) => update(l.key, { quantity: v })} keyboardType="decimal-pad" error={errors[`items.${idx}.quantity`]} /></View>
                  <View style={{ flex: 2 }}><TextField label="Unit price (R)" value={l.unitPrice} onChangeText={(v) => update(l.key, { unitPrice: v })} keyboardType="decimal-pad" error={errors[`items.${idx}.unitPrice`]} /></View>
                </View>
              </Card>
            ))}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button label="Labour" icon="plus" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setLines((ls) => [...ls, newLine('LABOUR')])} />
              <Button label="Material" icon="plus" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setLines((ls) => [...ls, newLine('MATERIAL')])} />
              <Button label="Fee" icon="plus" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setLines((ls) => [...ls, newLine('FEE')])} />
            </View>

            <Card style={{ gap: spacing.md }}>
              <TextField label="Discount (R)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" error={errors.discountAmount} />
              <DateField label="Valid until" value={validUntil} onChange={setValidUntil} minDate={todayIso()} error={errors.validUntil} />
              <TextField label="Terms" value={terms} onChangeText={setTerms} multiline maxLength={2000} />
              <TextField label="Notes to customer (optional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} />
              <Checkbox checked={send} onChange={setSend} label="Send to the customer now (they are notified and can accept or decline in the app)" />
            </Card>

            <Card accent="primary" style={{ gap: 4 }}>
              <KeyValue label="Labour" value={money(totals.labourCost)} mono />
              <KeyValue label="Materials" value={money(totals.materialsCost)} mono />
              <KeyValue label="Fees" value={money(totals.fees)} mono />
              <KeyValue label="Discount" value={`− ${money(totals.discountAmount)}`} valueColor="success" mono />
              <KeyValue label="Subtotal" value={money(totals.subtotal)} mono />
              <KeyValue label={`VAT (${Math.round(vatRate * 100)}%)`} value={money(totals.vatAmount)} mono />
              <Divider style={{ marginVertical: 4 }} />
              <View style={styles.between}>
                <Text variant="title" weight="bold">Total</Text>
                <Text variant="h2" color="primaryBright">{money(totals.total)}</Text>
              </View>
              <Text variant="caption" color="textMuted">Totals are recalculated on the server; figures here are a preview.</Text>
            </Card>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, borderRadius: radius.sm },
});
