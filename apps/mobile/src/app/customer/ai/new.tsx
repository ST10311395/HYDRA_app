import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { AiConversationDto, AiPropertyType, JobUrgency } from '@hydra/shared';
import { useAiStatus } from '../../../api/ai';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../../../api/client';
import { BrandHeader, Screen } from '../../../components/layout';
import { Button, Card, Label, Segmented, Text, TextField, colors, spacing, toast } from '../../../design-system';
import { SimulationBanner } from '../../../features/ai/components';
import { PhotoPicker, type UploadedPhoto } from '../../../features/photos';

/** Start a Smart Quote: description, photos (camera / gallery), property type, area and urgency. */
export default function NewAssessment() {
  const status = useAiStatus();
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [propertyType, setPropertyType] = useState<AiPropertyType>('RESIDENTIAL');
  const [urgency, setUrgency] = useState<JobUrgency>('STANDARD');
  const [siteArea, setSiteArea] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // One key per enquiry: a double tap or a retry after a timeout never creates a second case.
  const [requestKey] = useState(newIdempotencyKey);
  const sending = useRef(false);
  const max = status.data?.maxImagesPerMessage ?? 6;

  const submit = async () => {
    if (sending.current) return;
    if (message.trim().length < 5) {
      setError('Describe the problem in a few words');
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const c = await api.post<AiConversationDto>(
        '/ai/conversations',
        { message: message.trim(), attachmentIds: photos.map((p) => p.id), propertyType, urgency, siteArea: siteArea.trim() || undefined },
        { idempotencyKey: requestKey, timeoutMs: 60_000 },
      );
      router.replace(`/customer/ai/${c.id}`);
    } catch (e) {
      if (e instanceof ApiError) setError(e.fieldErrors().message);
      toast.error(errorMessage(e));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Smart Quote" back />
      <Screen withTabBar={false} footer={<Button label={busy ? 'Assessing…' : 'Send for assessment'} icon="send" loading={busy} disabled={status.data ? !status.data.enabled : false} onPress={() => void submit()} testID="ai-submit" haptic />}>
        <View>
          <Label color="secondaryBright">New assessment</Label>
          <Text variant="h1">What’s the problem?</Text>
          <Text variant="bodySmall" color="textMuted">Tell us what you see, hear or smell, when it happens and what is affected. Please don’t include ID numbers or banking details.</Text>
        </View>
        {status.data ? <SimulationBanner label={status.data.simulationLabel} /> : null}
        <Card style={{ gap: spacing.lg }}>
          <TextField label="Describe the problem" required multiline value={message} onChangeText={(v) => { setMessage(v); setError(undefined); }} placeholder="e.g. My DB trips whenever I turn the geyser on." maxLength={2000} error={error} testID="ai-message" />
          <PhotoPicker value={photos} onChange={setPhotos} purpose="AI_ASSESSMENT_PHOTO" max={max} label="Photos (optional) — DB board, equipment, error screens, damage" />
          <View style={{ gap: 6 }}>
            <Text variant="title" weight="bold">Property type</Text>
            <Segmented value={propertyType} onChange={setPropertyType} options={[{ value: 'RESIDENTIAL', label: 'Home' }, { value: 'COMMERCIAL', label: 'Business' }, { value: 'INDUSTRIAL', label: 'Industrial' }]} />
          </View>
          <TextField label="Suburb / town (optional)" value={siteArea} onChangeText={setSiteArea} placeholder="e.g. Umhlanga" icon="map-pin" helper="We only ask for the full address if you accept a proposal." />
          <View style={{ gap: 6 }}>
            <Text variant="title" weight="bold">How urgent does it feel?</Text>
            <Segmented tone="danger" value={urgency} onChange={setUrgency} options={[{ value: 'STANDARD', label: 'Not urgent' }, { value: 'HIGH', label: 'Soon' }, { value: 'EMERGENCY', label: 'Emergency' }]} />
          </View>
        </Card>
        <Text variant="caption" color="textMuted">{status.data?.disclaimer}</Text>
      </Screen>
    </View>
  );
}
