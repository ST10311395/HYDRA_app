import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { JobDetailDto, MaterialDto } from '@hydra/shared';
import { api, errorMessage, ApiError } from '../api/client';
import { flatten, useJob, useJobAction, useMaterials } from '../api/queries';
import { BrandHeader, Screen } from '../components/layout';
import { Badge, Button, Card, Icon, KeyValue, Label, LoadingCards, SearchField, Text, TextField, colors, confirm, radius, spacing, toast } from '../design-system';
import { useAuth } from '../store/auth';
import { money } from '../utils/format';
import { QueryFallback, notReady } from '../components/QueryState';

interface Line {
  material: MaterialDto;
  quantity: string;
  notes: string;
}

/**
 * Materials logging (PDF Story 8, spec §9.5): search stock, build a batch, submit once — the server
 * decrements stock atomically and recalculates the job's material cost.
 */
export function MaterialsLogger({ jobId }: { jobId: string }) {
  const role = useAuth((s) => s.user?.role);
  const job = useJob(jobId);
  const [search, setSearch] = useState('');
  const materials = useMaterials({ search: search.trim() || undefined });
  const [lines, setLines] = useState<Line[]>([]);
  const [override, setOverride] = useState(false);
  const submit = useJobAction((body: { items: { materialId: string; quantity: number; notes?: string }[]; overrideStock: boolean }) => api.post<JobDetailDto>(`/jobs/${jobId}/materials`, body));
  const remove = useJobAction((jmId: string) => api.delete<JobDetailDto>(`/jobs/${jobId}/materials/${jmId}`));
  const showCost = role !== 'EMPLOYEE';

  const add = (m: MaterialDto) => {
    if (lines.some((l) => l.material.id === m.id)) return;
    setLines([...lines, { material: m, quantity: '1', notes: '' }]);
    setSearch('');
  };

  const onSubmit = () => {
    const items = lines.map((l) => ({ materialId: l.material.id, quantity: Number(l.quantity.replace(',', '.')), notes: l.notes || undefined }));
    if (items.some((i) => !(i.quantity > 0))) return toast.error('Enter a quantity greater than 0 for every item');
    submit.mutate({ items, overrideStock: override }, {
      onSuccess: () => {
        toast.success('Materials logged and stock updated');
        setLines([]);
        setOverride(false);
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'INSUFFICIENT_STOCK') toast.error(e.details?.map((d) => d.message).join('\n') ?? e.message);
        else toast.error(errorMessage(e));
      },
    });
  };

  const results = flatten(materials.data).filter((m) => !m.isArchived);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Log Materials" back />
      <Screen withTabBar={false} footer={lines.length ? <Button label={`Submit ${lines.length} item${lines.length > 1 ? 's' : ''}`} icon="check" loading={submit.isPending} onPress={onSubmit} haptic /> : undefined}>
        {job.data ? <Text variant="mono" color="primaryBright">{job.data.reference} · {job.data.serviceType.name}</Text> : null}
        <SearchField value={search} onChangeText={setSearch} placeholder="Search stock by name or SKU…" />
        {search ? (
          <Card padded={false}>
            {materials.isLoading ? <View style={{ padding: spacing.lg }}><LoadingCards count={1} /></View> : results.length === 0 ? (
              <Text variant="bodySmall" color="textMuted" style={{ padding: spacing.lg }}>No matching materials.</Text>
            ) : results.slice(0, 8).map((m) => (
              <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Add ${m.name}`} onPress={() => add(m)} style={styles.result}>
                <View style={{ flex: 1 }}>
                  <Text variant="title">{m.name}</Text>
                  <Text variant="caption" color="textMuted">{m.sku} · {m.stockLevel} {m.unit} in stock</Text>
                </View>
                {m.isLowStock ? <Badge label="LOW" tone="warning" /> : null}
                <Icon name="plus-circle" color="primaryBright" />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {lines.length ? <Label>Batch to log</Label> : null}
        {lines.map((l, idx) => {
          const qty = Number(l.quantity.replace(',', '.'));
          const short = qty > l.material.stockLevel;
          return (
            <Card key={l.material.id} accent={short ? 'danger' : 'none'} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="title" weight="bold" style={{ flex: 1 }}>{l.material.name}</Text>
                <Pressable accessibilityLabel="Remove line" hitSlop={10} onPress={() => setLines(lines.filter((_, i) => i !== idx))}><Icon name="trash-2" size={18} color="dangerBright" /></Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><TextField label={`Quantity (${l.material.unit})`} keyboardType="decimal-pad" value={l.quantity} onChangeText={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))} error={short ? `Only ${l.material.stockLevel} in stock` : undefined} /></View>
                <View style={{ flex: 1.3 }}><TextField label="Notes" value={l.notes} onChangeText={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, notes: v } : x)))} maxLength={300} /></View>
              </View>
            </Card>
          );
        })}
        {role === 'ADMIN_OWNER' && lines.some((l) => Number(l.quantity) > l.material.stockLevel) ? (
          <Button label={override ? 'Stock override authorised' : 'Authorise stock override (owner)'} icon="shield" variant={override ? 'violet' : 'outline'} onPress={() => void (async () => {
            if (override) return setOverride(false);
            if (await confirm({ title: 'Override stock limit?', message: 'Stock will go below zero. This is audited.', confirmLabel: 'Authorise', destructive: true })) setOverride(true);
          })()} />
        ) : null}

        <Label>Logged on this job</Label>
        {notReady(job) ? <QueryFallback query={job} count={1} /> : (job.data?.materials.length ?? 0) === 0 ? (
          <Text variant="bodySmall" color="textMuted">Nothing logged yet.</Text>
        ) : job.data!.materials.map((m) => (
          <Card key={m.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="title" weight="bold" style={{ flex: 1 }}>{m.materialName}</Text>
              <Pressable accessibilityLabel="Reverse this entry" hitSlop={10} onPress={() => void (async () => {
                if (await confirm({ title: 'Reverse this entry?', message: `${m.quantityUsed} ${m.unit} will be returned to stock.`, confirmLabel: 'Reverse', destructive: true })) {
                  remove.mutate(m.id, { onError: (e) => toast.error(errorMessage(e)) });
                }
              })()}><Icon name="rotate-ccw" size={16} color="textMuted" /></Pressable>
            </View>
            <KeyValue label={`${m.quantityUsed} ${m.unit} · ${m.loggedByName}`} value={showCost ? money(m.lineCost) : ''} mono />
            {m.notes ? <Text variant="caption" color="textMuted">{m.notes}</Text> : null}
          </Card>
        ))}
        {showCost && job.data ? <KeyValue label="Actual materials cost" value={money(job.data.materialsCost)} valueColor="primaryBright" mono /> : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, minHeight: 56, borderRadius: radius.sm },
});
