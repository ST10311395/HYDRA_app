/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { adminCreateJobSchema, type CustomerDto, type JobDetailDto, type JobUrgency } from '@hydra/shared';
import { api, errorMessage, newIdempotencyKey } from '../../api/client';
import { flatten, useCustomer, useCustomers, useServices, useSimpleMutation } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { Button, Card, DateField, Icon, Label, SearchField, Segmented, SelectField, Text, TextField, colors, radius, spacing, toast } from '../../design-system';
import { useSyncFrom } from '../../hooks/useSyncFrom';
import { todayIso } from '../../utils/format';

/** Admin logs a job for a customer (phone/walk-in booking) — POST /jobs/admin. */
export default function NewJob() {
  const params = useLocalSearchParams<{ customerId?: string }>();
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [search, setSearch] = useState('');
  const customers = useCustomers(search.trim() || undefined);
  const preset = useCustomer(params.customerId ?? '');
  const services = useServices();
  const [form, setForm] = useState({ serviceTypeId: '', siteAddress: '', description: '', urgency: 'STANDARD' as JobUrgency, preferredDate: '', preferredTimeWindow: 'ANY' as 'MORNING' | 'AFTERNOON' | 'ANY', contactPhone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key] = useState(newIdempotencyKey);

  useSyncFrom(preset.data, (c) => {
    if (!customer) pick(c);
  });

  function pick(c: CustomerDto) {
    setCustomer(c);
    setForm((f) => ({ ...f, siteAddress: f.siteAddress || c.address || '', contactPhone: f.contactPhone || c.phone || '' }));
  }

  const create = useSimpleMutation((body: object) => api.post<JobDetailDto>('/jobs/admin', body, { idempotencyKey: key }), [['jobs'], ['dashboard'], ['customers']]);

  const submit = () => {
    if (!customer) return;
    const parsed = adminCreateJobSchema.safeParse({
      ...form,
      customerId: customer.id,
      preferredDate: form.preferredDate || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (j) => { toast.success(`Job ${j.reference} created`); router.replace(`/admin/job/${j.id}`); },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const list = flatten(customers.data).slice(0, 8);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Log Job" back />
      <Screen withTabBar={false} footer={<Button label="Create job" icon="plus-circle" disabled={!customer} loading={create.isPending} onPress={submit} testID="new-job-submit" />}>
        <Label>1 · Customer</Label>
        {customer ? (
          <Card accent="primary" style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="title" weight="bold">{customer.firstName} {customer.lastName}</Text>
              <Button label="Change" size="sm" variant="ghost" fullWidth={false} onPress={() => setCustomer(null)} />
            </View>
            <Text variant="caption" color="textMuted">{customer.email}{customer.phone ? ` · ${customer.phone}` : ''}</Text>
          </Card>
        ) : (
          <>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search customers by name, email, phone…" />
            {list.length === 0 && !customers.isLoading ? (
              <Text variant="bodySmall" color="textMuted">No matching customer. New customers can be created by converting an enquiry, or they can register in the app.</Text>
            ) : list.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => pick(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
                <Icon name="user" size={18} color="primaryBright" />
                <View style={{ flex: 1 }}>
                  <Text variant="title" weight="bold">{c.firstName} {c.lastName}</Text>
                  <Text variant="caption" color="textMuted">{c.email}</Text>
                </View>
                <Icon name="chevron-right" size={18} color="textMuted" />
              </Pressable>
            ))}
          </>
        )}

        <Label>2 · Job details</Label>
        <Card style={{ gap: spacing.md }}>
          <SelectField label="Service type" value={form.serviceTypeId || undefined} onChange={(v) => setForm({ ...form, serviceTypeId: v })} options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} error={errors.serviceTypeId} />
          <TextField label="Site address" required value={form.siteAddress} onChangeText={(v) => setForm({ ...form, siteAddress: v })} icon="map-pin" maxLength={300} error={errors.siteAddress} />
          <TextField label="Description" required value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline maxLength={2000} error={errors.description} placeholder="What the customer reported, access details, equipment…" />
          <Text variant="title" weight="bold">Urgency</Text>
          <Segmented tone="danger" value={form.urgency} onChange={(v) => setForm({ ...form, urgency: v })} options={[{ value: 'STANDARD', label: 'Standard' }, { value: 'HIGH', label: 'High priority' }, { value: 'EMERGENCY', label: 'Emergency' }]} />
          <DateField label="Preferred date (optional)" value={form.preferredDate || undefined} onChange={(v) => setForm({ ...form, preferredDate: v })} minDate={todayIso()} error={errors.preferredDate} />
          <Segmented value={form.preferredTimeWindow} onChange={(v) => setForm({ ...form, preferredTimeWindow: v })} options={[{ value: 'MORNING', label: 'Morning' }, { value: 'AFTERNOON', label: 'Afternoon' }, { value: 'ANY', label: 'Any time' }]} />
          <TextField label="Site contact phone" value={form.contactPhone} onChangeText={(v) => setForm({ ...form, contactPhone: v })} keyboardType="phone-pad" maxLength={24} error={errors.contactPhone} />
        </Card>
      </Screen>
    </View>
  );
}
