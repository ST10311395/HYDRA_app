import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { createJobSchema } from '@hydra/shared';
import { ApiError, errorMessage, newIdempotencyKey } from '../../api/client';
import { useCreateJob, useServices } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { Button, Card, Checkbox, DateField, Label, SelectField, Segmented, Text, TextField, colors, spacing, toast } from '../../design-system';
import { PhotoPicker, type UploadedPhoto } from '../../features/photos';
import { useAuth } from '../../store/auth';
import { todayIso } from '../../utils/format';
import { useRef, useState } from 'react';

const formSchema = createJobSchema.omit({ attachmentIds: true, siteLocation: true });
type Form = z.input<typeof formSchema>;

/** Request Service (spec §8.2, PDF Story 1) → creates a REQUESTED job visible to admin. */
export default function RequestService() {
  const params = useLocalSearchParams<{ serviceTypeId?: string }>();
  const user = useAuth((s) => s.user);
  const services = useServices();
  const create = useCreateJob();
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  // One key per request: a double tap or a retry after a timeout replays instead of duplicating.
  const [requestKey] = useState(newIdempotencyKey);
  const sending = useRef(false);
  const { control, handleSubmit, formState, setError } = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      serviceTypeId: params.serviceTypeId ?? '',
      siteAddress: '',
      description: '',
      urgency: 'STANDARD',
      preferredTimeWindow: 'ANY',
      contactPhone: user?.phone ?? '',
      contactConfirmed: false as unknown as true,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const job = await create.mutateAsync({ ...values, attachmentIds: photos.map((p) => p.id), idempotencyKey: requestKey });
      toast.success(`Request ${job.reference} logged — a quote will follow.`);
      router.replace(`/customer/job/${job.id}`);
    } catch (e) {
      if (e instanceof ApiError) Object.entries(e.fieldErrors()).forEach(([k, m]) => setError(k as keyof Form, { message: m }));
      toast.error(errorMessage(e));
    }
  });
  const submit = () => {
    if (sending.current) return;
    sending.current = true;
    void onSubmit().finally(() => {
      sending.current = false;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Request Service" back />
      <Screen withTabBar={false} footer={<Button label="Submit request" icon="send" loading={formState.isSubmitting} onPress={submit} haptic testID="request-submit" />}>
        <View>
          <Label color="primaryBright">New service request</Label>
          <Text variant="h1">What do you need?</Text>
          <Text variant="bodySmall" color="textMuted">An engineer reviews every request and sends an itemised quote before any work is scheduled.</Text>
        </View>
        <Card style={{ gap: spacing.lg }}>
          <Controller control={control} name="serviceTypeId" render={({ field }) => (
            <SelectField label="Service type" value={field.value || undefined} onChange={field.onChange} options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} placeholder={services.isLoading ? 'Loading…' : 'Choose a service'} error={formState.errors.serviceTypeId?.message} />
          )} />
          <Controller control={control} name="siteAddress" render={({ field }) => (
            <TextField label="Site address" required icon="map-pin" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Where should we work?" helper="This can differ from your home address." error={formState.errors.siteAddress?.message} testID="request-address" />
          )} />
          <Controller control={control} name="description" render={({ field }) => (
            <TextField label="Describe the problem or project" required multiline value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="e.g. Main breaker trips when the stove is on…" error={formState.errors.description?.message} maxLength={2000} testID="request-description" />
          )} />
          <Controller control={control} name="urgency" render={({ field }) => (
            <View style={{ gap: 6 }}>
              <Text variant="title" weight="bold">Urgency</Text>
              <Segmented tone="danger" value={field.value ?? 'STANDARD'} onChange={field.onChange} options={[{ value: 'STANDARD', label: 'Standard' }, { value: 'HIGH', label: 'High priority' }, { value: 'EMERGENCY', label: 'Emergency' }]} />
            </View>
          )} />
          <Controller control={control} name="preferredDate" render={({ field }) => (
            <DateField label="Preferred date (optional)" value={field.value} minDate={todayIso()} onChange={field.onChange} />
          )} />
          <Controller control={control} name="preferredTimeWindow" render={({ field }) => (
            <Segmented value={field.value ?? 'ANY'} onChange={field.onChange} options={[{ value: 'MORNING', label: 'Morning' }, { value: 'AFTERNOON', label: 'Afternoon' }, { value: 'ANY', label: 'Any time' }]} />
          )} />
          <PhotoPicker value={photos} onChange={setPhotos} purpose="JOB_PHOTO" label="Photos (optional)" />
        </Card>
        <Card style={{ gap: spacing.md }}>
          <Controller control={control} name="contactPhone" render={({ field }) => (
            <TextField label="Contact number for this job" value={field.value ?? ''} onChangeText={field.onChange} keyboardType="phone-pad" icon="phone" />
          )} />
          <Controller control={control} name="contactConfirmed" render={({ field }) => (
            <Checkbox checked={!!field.value} onChange={field.onChange} error={formState.errors.contactConfirmed?.message} label="I confirm my contact details are correct and the site is safe to access." />
          )} />
        </Card>
      </Screen>
    </View>
  );
}
