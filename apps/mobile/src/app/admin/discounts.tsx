/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { View } from 'react-native';
import { discountSchema, type DiscountDto } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { flatten, useAdminDiscounts, useSimpleMutation } from '../../api/queries';
import { AdminList, parseAmount } from '../../components/admin';
import { Badge, Button, Card, Checkbox, DateField, KeyValue, Label, Segmented, Text, TextField, spacing, toast } from '../../design-system';
import { addDaysIso, fmtDate, money, todayIso } from '../../utils/format';

const KEYS = [['discounts']];

/** Rewards offers (spec §10 “manage discounts”, PDF Story 14): create, activate/deactivate, extend. */
export default function Discounts() {
  const q = useAdminDiscounts();
  const [creating, setCreating] = useState(false);
  return (
    <AdminList<DiscountDto>
      section="Discounts"
      items={flatten(q.data)}
      query={q}
      emptyIcon="gift"
      emptyTitle="No discount offers"
      emptyMessage="Customers redeem reward points for these offers against unpaid invoices."
      header={creating ? <NewDiscount onDone={() => setCreating(false)} /> : <Button label="New offer" icon="plus" size="sm" onPress={() => setCreating(true)} />}
      renderItem={({ item }) => <DiscountCard d={item} />}
    />
  );
}

function DiscountCard({ d }: { d: DiscountDto }) {
  const [extendTo, setExtendTo] = useState('');
  const update = useSimpleMutation((body: object) => api.patch<DiscountDto>(`/discounts/${d.id}`, body), KEYS);
  const expired = d.validUntil < todayIso();
  return (
    <Card accent={d.active && !expired ? 'secondary' : 'none'} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="mono" color="secondaryBright">{d.code}</Text>
        <Badge label={!d.active ? 'INACTIVE' : expired ? 'EXPIRED' : 'ACTIVE'} tone={!d.active || expired ? 'neutral' : 'success'} />
      </View>
      <Text variant="title" weight="bold">{d.discountType === 'PERCENT' ? `${d.value}% off` : `${money(d.value)} off`}</Text>
      <Text variant="bodySmall" color="textMuted">{d.description}</Text>
      <KeyValue label="Points cost" value={String(d.pointsCost)} mono />
      <KeyValue label="Minimum spend" value={money(d.minSpend)} mono />
      <KeyValue label="Valid" value={`${fmtDate(d.validFrom)} – ${fmtDate(d.validUntil)}`} />
      <KeyValue label="Redeemed" value={`${d.redemptionCount}${d.maxRedemptions ? ` / ${d.maxRedemptions}` : ''}`} />
      <DateField label="Extend validity to" value={extendTo || undefined} onChange={setExtendTo} minDate={todayIso()} placeholder="Choose a new end date" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label={d.active ? 'Deactivate' : 'Activate'} size="sm" variant={d.active ? 'dangerOutline' : 'secondary'} style={{ flex: 1 }} loading={update.isPending && !extendTo}
          onPress={() => update.mutate({ active: !d.active }, { onSuccess: () => toast.success(d.active ? 'Offer deactivated' : 'Offer activated'), onError: (e) => toast.error(errorMessage(e)) })} />
        <Button label="Save date" size="sm" style={{ flex: 1 }} disabled={!extendTo} loading={update.isPending && !!extendTo}
          onPress={() => update.mutate({ validUntil: extendTo }, { onSuccess: () => { toast.success('Validity updated'); setExtendTo(''); }, onError: (e) => toast.error(errorMessage(e)) })} />
      </View>
    </Card>
  );
}

function NewDiscount({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ code: '', description: '', discountType: 'PERCENT' as 'PERCENT' | 'FIXED', value: '', pointsCost: '', minSpend: '0', validFrom: todayIso(), validUntil: addDaysIso(todayIso(), 90), active: true, maxRedemptions: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useSimpleMutation((body: object) => api.post<DiscountDto>('/discounts', body), KEYS);
  const submit = () => {
    const parsed = discountSchema.safeParse({
      ...f,
      value: parseAmount(f.value),
      pointsCost: Math.round(parseAmount(f.pointsCost)),
      minSpend: parseAmount(f.minSpend) || 0,
      maxRedemptions: f.maxRedemptions ? Math.round(parseAmount(f.maxRedemptions)) : undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      setErrors(errs);
      return;
    }
    create.mutate(parsed.data, { onSuccess: () => { toast.success('Offer created'); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Card accent="primary" style={{ gap: spacing.md }}>
      <Label color="primaryBright">New rewards offer</Label>
      <TextField label="Code" value={f.code} onChangeText={(v) => setF({ ...f, code: v.toUpperCase() })} autoCapitalize="characters" maxLength={24} error={errors.code} placeholder="WINTER-10" />
      <TextField label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} maxLength={300} error={errors.description} />
      <Segmented value={f.discountType} onChange={(v) => setF({ ...f, discountType: v })} options={[{ value: 'PERCENT', label: 'Percentage' }, { value: 'FIXED', label: 'Fixed amount' }]} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label={f.discountType === 'PERCENT' ? 'Percent' : 'Amount (R)'} value={f.value} onChangeText={(v) => setF({ ...f, value: v })} keyboardType="decimal-pad" error={errors.value} /></View>
        <View style={{ flex: 1 }}><TextField label="Points cost" value={f.pointsCost} onChangeText={(v) => setF({ ...f, pointsCost: v })} keyboardType="number-pad" error={errors.pointsCost} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="Min. spend (R)" value={f.minSpend} onChangeText={(v) => setF({ ...f, minSpend: v })} keyboardType="decimal-pad" error={errors.minSpend} /></View>
        <View style={{ flex: 1 }}><TextField label="Max uses (optional)" value={f.maxRedemptions} onChangeText={(v) => setF({ ...f, maxRedemptions: v })} keyboardType="number-pad" error={errors.maxRedemptions} /></View>
      </View>
      <DateField label="Valid from" value={f.validFrom} onChange={(v) => setF({ ...f, validFrom: v })} />
      <DateField label="Valid until" value={f.validUntil} onChange={(v) => setF({ ...f, validUntil: v })} minDate={f.validFrom} error={errors.validUntil} />
      <Checkbox checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Active immediately" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onDone} />
        <Button label="Create offer" style={{ flex: 1 }} loading={create.isPending} onPress={submit} />
      </View>
    </Card>
  );
}
