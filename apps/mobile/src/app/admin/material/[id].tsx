import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { View } from 'react-native';
import { materialSchema, type MaterialDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { flatten, useMaterial, useMovements, useSimpleMutation } from '../../../api/queries';
import { parseAmount, useIsOwner } from '../../../components/admin';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, ErrorState, KeyValue, Label, Segmented, Text, TextField, colors, confirm, spacing, toast } from '../../../design-system';
import { fmtDateTime, money } from '../../../utils/format';
import { useSyncFrom } from '../../../hooks/useSyncFrom';
import { QueryFallback, notReady } from '../../../components/QueryState';

interface Form {
  sku: string;
  name: string;
  unit: string;
  unitCost: string;
  stockLevel: string;
  reorderLevel: string;
  supplierName: string;
  supplierContact: string;
}

const EMPTY: Form = { sku: '', name: '', unit: 'each', unitCost: '', stockLevel: '0', reorderLevel: '0', supplierName: '', supplierContact: '' };

/** Create / edit / archive a material, adjust stock (audited movement) and view its ledger. */
export default function MaterialDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const owner = useIsOwner();
  const q = useMaterial(id);
  const ledger = useMovements(isNew ? {} : { materialId: id });
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adj, setAdj] = useState({ direction: 'IN' as 'IN' | 'OUT', qty: '', reason: 'RESTOCK' as 'RESTOCK' | 'ADJUSTMENT', note: '' });
  const m = q.data;

  useSyncFrom(m, (x) => setForm({ sku: x.sku, name: x.name, unit: x.unit, unitCost: String(x.unitCost), stockLevel: String(x.stockLevel), reorderLevel: String(x.reorderLevel), supplierName: x.supplierName ?? '', supplierContact: x.supplierContact ?? '' }));

  const keys = [['materials'], ['material', id], ['stock-movements'], ['dashboard']];
  const save = useSimpleMutation((body: object) => (isNew ? api.post<MaterialDto>('/materials', body) : api.patch<MaterialDto>(`/materials/${id}`, body)), keys);
  const archive = useSimpleMutation((archived: boolean) => api.post<MaterialDto>(`/materials/${id}/archive`, { archived }), keys);
  const adjust = useSimpleMutation((body: object) => api.post<MaterialDto>(`/materials/${id}/adjust`, body), keys);

  const submit = () => {
    const payload = {
      sku: form.sku, name: form.name, unit: form.unit, unitCost: parseAmount(form.unitCost), stockLevel: parseAmount(form.stockLevel), reorderLevel: parseAmount(form.reorderLevel),
      supplierName: form.supplierName, supplierContact: form.supplierContact,
    };
    const parsed = materialSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    const { stockLevel: _opening, ...editable } = parsed.data;
    save.mutate(isNew ? parsed.data : editable, {
      onSuccess: (r) => { toast.success(isNew ? 'Material created' : 'Material updated'); if (isNew) router.replace(`/admin/material/${r.id}`); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const qty = parseAmount(adj.qty);
  const delta = adj.direction === 'IN' ? qty : -qty;
  const goesNegative = !!m && m.stockLevel + delta < 0;

  const field = (key: keyof Form, label: string, extra: Partial<ComponentProps<typeof TextField>> = {}) => (
    <TextField label={label} value={form[key]} onChangeText={(v) => setForm({ ...form, [key]: v })} error={errors[key]} {...extra} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section={isNew ? 'New Material' : (m?.name ?? 'Material')} back />
      <Screen withTabBar={false} onRefresh={isNew ? undefined : () => void q.refetch()} refreshing={q.isRefetching}>
        {!isNew && notReady(q) ? <QueryFallback query={q} /> : !isNew && (q.isError || !m) ? <ErrorState onRetry={() => void q.refetch()} /> : (
          <>
            {m ? (
              <Card accent={m.isLowStock ? 'danger' : 'none'} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="mono" color="textMuted">{m.sku}</Text>
                  {m.isArchived ? <Badge label="ARCHIVED" /> : m.isLowStock ? <Badge label="LOW STOCK" tone="danger" /> : <Badge label="IN STOCK" tone="success" />}
                </View>
                <Text variant="h1" color={m.isLowStock ? 'dangerBright' : 'text'}>{m.stockLevel} <Text variant="h3" color="textMuted">{m.unit}</Text></Text>
                <KeyValue label="Reorder level" value={`${m.reorderLevel} ${m.unit}`} />
                <KeyValue label="Stock value" value={money(m.stockLevel * m.unitCost)} mono />
                <KeyValue label="Updated" value={fmtDateTime(m.updatedAt)} />
              </Card>
            ) : null}

            <Card style={{ gap: spacing.md }}>
              <Label>{isNew ? 'Item details' : 'Edit details'}</Label>
              {field('sku', 'SKU', { autoCapitalize: 'characters', maxLength: 40 })}
              {field('name', 'Name', { maxLength: 120 })}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>{field('unit', 'Unit', { maxLength: 20, placeholder: 'each / m / roll' })}</View>
                <View style={{ flex: 1 }}>{field('unitCost', 'Unit cost (R)', { keyboardType: 'decimal-pad' })}</View>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {isNew ? <View style={{ flex: 1 }}>{field('stockLevel', 'Opening stock', { keyboardType: 'decimal-pad' })}</View> : null}
                <View style={{ flex: 1 }}>{field('reorderLevel', 'Reorder level', { keyboardType: 'decimal-pad' })}</View>
              </View>
              {field('supplierName', 'Supplier (optional)', { maxLength: 120 })}
              {field('supplierContact', 'Supplier contact (optional)', { maxLength: 120 })}
              <Button label={isNew ? 'Create material' : 'Save changes'} icon="save" loading={save.isPending} onPress={submit} />
            </Card>

            {m && !m.isArchived ? (
              <Card accent="primary" style={{ gap: spacing.md }}>
                <Label color="primaryBright">Adjust stock</Label>
                <Segmented value={adj.direction} onChange={(v) => setAdj({ ...adj, direction: v, reason: v === 'IN' ? adj.reason : 'ADJUSTMENT' })} options={[{ value: 'IN', label: 'Add stock' }, { value: 'OUT', label: 'Remove stock' }]} />
                {adj.direction === 'IN' ? <Segmented value={adj.reason} onChange={(v) => setAdj({ ...adj, reason: v })} options={[{ value: 'RESTOCK', label: 'Restock / delivery' }, { value: 'ADJUSTMENT', label: 'Stock-take correction' }]} /> : null}
                <TextField label={`Quantity (${m.unit})`} value={adj.qty} onChangeText={(v) => setAdj({ ...adj, qty: v })} keyboardType="decimal-pad" />
                <TextField label="Reason / note" value={adj.note} onChangeText={(v) => setAdj({ ...adj, note: v })} placeholder="e.g. Supplier invoice INV-2231" maxLength={300} />
                {goesNegative ? <Text variant="caption" color="dangerBright">{owner ? 'This takes stock below zero — owner override will be audited.' : 'Stock cannot go below zero without the owner.'}</Text> : null}
                <Button label="Apply adjustment" icon="check" loading={adjust.isPending} disabled={!Number.isFinite(qty) || qty <= 0 || adj.note.trim().length < 3 || (goesNegative && !owner)}
                  onPress={() => adjust.mutate({ delta, reason: adj.direction === 'IN' ? adj.reason : 'ADJUSTMENT', note: adj.note.trim() }, {
                    onSuccess: (r) => { toast.success(`Stock now ${r.stockLevel} ${r.unit}`); setAdj({ ...adj, qty: '', note: '' }); },
                    onError: (e) => toast.error(errorMessage(e)),
                  })} />
              </Card>
            ) : null}

            {m ? (
              <Button label={m.isArchived ? 'Restore material' : 'Archive material'} icon={m.isArchived ? 'rotate-ccw' : 'archive'} variant={m.isArchived ? 'secondary' : 'dangerOutline'} loading={archive.isPending}
                onPress={() => void (async () => {
                  if (!m.isArchived && !(await confirm({ title: `Archive ${m.name}?`, message: 'It will no longer be offered to electricians when logging materials. History is kept.', confirmLabel: 'Archive', destructive: true }))) return;
                  archive.mutate(!m.isArchived, { onSuccess: () => toast.success(m.isArchived ? 'Restored' : 'Archived'), onError: (e) => toast.error(errorMessage(e)) });
                })()} />
            ) : null}

            {m ? (
              <Card style={{ gap: spacing.sm }}>
                <Label>Movement history</Label>
                {flatten(ledger.data).length === 0 ? <Text variant="bodySmall" color="textMuted">No movements.</Text> : flatten(ledger.data).map((mv) => (
                  <View key={mv.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" weight="semibold">{mv.reason.replace('_', ' ').toLowerCase()}{mv.jobReference ? ` · ${mv.jobReference}` : ''}</Text>
                      <Text variant="caption" color="textMuted">{mv.actorName} · {fmtDateTime(mv.createdAt)}{mv.note ? ` · ${mv.note}` : ''}</Text>
                    </View>
                    <Text variant="mono" color={mv.delta < 0 ? 'dangerBright' : 'success'}>{mv.delta > 0 ? '+' : ''}{mv.delta}</Text>
                  </View>
                ))}
                {ledger.hasNextPage ? <Button label="Load more" variant="ghost" size="sm" onPress={() => void ledger.fetchNextPage()} /> : null}
              </Card>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
