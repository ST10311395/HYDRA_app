/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SERVICE_CATEGORIES, serviceTypeSchema, type ServiceCategory, type ServiceTypeDto } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { useServices, useSimpleMutation } from '../../api/queries';
import { parseAmount } from '../../components/admin';
import { BrandHeader } from '../../components/layout';
import { Badge, Button, Card, Checkbox, EmptyState, Icon, Label, SelectField, Text, TextField, colors, spacing, toast } from '../../design-system';
import { SERVICE_ICON, money } from '../../utils/format';
import { QueryFallback, notReady } from '../../components/QueryState';

const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  SOLAR: 'Solar & renewables', CABLING: 'Industrial cabling & fibre', SUBSTATIONS: 'High-voltage & substations',
  EMERGENCY: 'Emergency repairs', COMPLIANCE: 'Compliance & CoC', AUTOMATION: 'Smart energy & automation',
};

/** Structured service types (spec §5.4) — the catalogue customers choose from when requesting work. */
export default function ServiceTypes() {
  const q = useServices({ includeInactive: 'true' });
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Service Types" back />
      <FlatList
        data={q.data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
        ListHeaderComponent={editing === 'new' ? <ServiceForm onDone={() => setEditing(null)} /> : <Button label="New service type" icon="plus" size="sm" onPress={() => setEditing('new')} />}
        renderItem={({ item: s }) => editing === s.id ? <ServiceForm service={s} onDone={() => setEditing(null)} /> : (
          <Card onPress={() => setEditing(s.id)} accessibilityLabel={`Edit ${s.name}`} style={{ gap: 4, opacity: s.isActive ? 1 : 0.6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name={SERVICE_ICON[s.category] ?? 'zap'} size={16} color="primaryBright" />
              <Text variant="title" weight="bold" style={{ flex: 1 }}>{s.name}</Text>
              {s.isActive ? null : <Badge label="HIDDEN" />}
            </View>
            <Text variant="caption" color="textMuted">{CATEGORY_LABEL[s.category]} · from {money(s.basePrice)}{s.slaText ? ` · ${s.slaText}` : ''}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={2}>{s.description}</Text>
          </Card>
        )}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="grid" title="No service types" />}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}

function ServiceForm({ service, onDone }: { service?: ServiceTypeDto; onDone: () => void }) {
  const [f, setF] = useState({
    name: service?.name ?? '', category: (service?.category ?? 'SOLAR') as ServiceCategory, description: service?.description ?? '', basePrice: service ? String(service.basePrice) : '',
    slaText: service?.slaText ?? '', badge: service?.badge ?? '', isActive: service?.isActive ?? true, displayOrder: String(service?.displayOrder ?? 0),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSimpleMutation((body: object) => (service ? api.patch<ServiceTypeDto>(`/service-types/${service.id}`, body) : api.post<ServiceTypeDto>('/service-types', body)), [['service-types']]);
  const submit = () => {
    const parsed = serviceTypeSchema.safeParse({ ...f, basePrice: parseAmount(f.basePrice), displayOrder: Math.round(parseAmount(f.displayOrder) || 0) });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      setErrors(errs);
      return;
    }
    save.mutate(parsed.data, { onSuccess: () => { toast.success(service ? 'Service updated' : 'Service created'); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Card accent="primary" style={{ gap: spacing.md }}>
      <Label color="primaryBright">{service ? 'Edit service type' : 'New service type'}</Label>
      <TextField label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={120} error={errors.name} />
      <SelectField label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c], icon: SERVICE_ICON[c] }))} />
      <TextField label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline maxLength={1000} error={errors.description} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="Base price (R)" value={f.basePrice} onChangeText={(v) => setF({ ...f, basePrice: v })} keyboardType="decimal-pad" error={errors.basePrice} /></View>
        <View style={{ flex: 1 }}><TextField label="Display order" value={f.displayOrder} onChangeText={(v) => setF({ ...f, displayOrder: v })} keyboardType="number-pad" /></View>
      </View>
      <TextField label="SLA text (optional)" value={f.slaText} onChangeText={(v) => setF({ ...f, slaText: v })} maxLength={80} placeholder="e.g. 4-hour response" />
      <TextField label="Badge (optional)" value={f.badge} onChangeText={(v) => setF({ ...f, badge: v })} maxLength={40} placeholder="e.g. 24/7" />
      <Checkbox checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Visible to customers" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onDone} />
        <Button label="Save" style={{ flex: 1 }} loading={save.isPending} onPress={submit} />
      </View>
    </Card>
  );
}
