import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ComplianceStatus, JobDetailDto } from '@hydra/shared';
import { ApiError, api, errorMessage } from '../../../api/client';
import { useJob, useJobAction, useUploadFile } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Badge, Button, Card, Checkbox, Icon, Label, Segmented, Text, TextField, colors, confirm, radius, spacing, toast } from '../../../design-system';
import { PhotoPicker, type UploadedPhoto } from '../../../features/photos';

type Result = 'PASS' | 'FAIL' | 'NA';
interface Check {
  key: string;
  label: string;
  result: Result;
  reading: string;
}

const DEFAULT_CHECKS: Check[] = [
  { key: 'earth_continuity', label: 'Earth continuity', result: 'PASS', reading: '' },
  { key: 'insulation', label: 'Insulation resistance', result: 'PASS', reading: '' },
  { key: 'elu_trip', label: 'Earth leakage trip test (30mA)', result: 'PASS', reading: '' },
  { key: 'polarity', label: 'Polarity', result: 'PASS', reading: '' },
  { key: 'bonding', label: 'Equipotential bonding', result: 'PASS', reading: '' },
  { key: 'db_condition', label: 'Distribution board condition & labelling', result: 'PASS', reading: '' },
  { key: 'isolation', label: 'Isolation & switching', result: 'PASS', reading: '' },
  { key: 'loop_impedance', label: 'Earth fault loop impedance', result: 'NA', reading: '' },
];

interface Draft {
  status: ComplianceStatus;
  certificate: string;
  findings: string;
  notes: string;
  checks: Check[];
  signature: string;
}

/** Inspection / compliance report (PDF Story 9, spec §9.6). Drafts autosave locally for weak-signal sites. */
export default function InspectionForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const draftKey = `hydra.inspection-draft.${id}`;
  const [d, setD] = useState<Draft>({ status: 'PASS', certificate: '', findings: '', notes: '', checks: DEFAULT_CHECKS, signature: '' });
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [doc, setDoc] = useState<{ id: string; name: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);
  const upload = useUploadFile();
  const submit = useJobAction((body: object) => api.post<JobDetailDto>(`/jobs/${id}/inspection`, body));

  useEffect(() => {
    void AsyncStorage.getItem(draftKey).then((raw) => {
      if (raw) {
        setD(JSON.parse(raw) as Draft);
        toast.info('Restored your unsent inspection draft');
      }
      setRestored(true);
    });
  }, [draftKey]);

  useEffect(() => {
    if (restored) void AsyncStorage.setItem(draftKey, JSON.stringify(d));
  }, [d, draftKey, restored]);

  const setCheck = (key: string, patch: Partial<Check>) => setD({ ...d, checks: d.checks.map((c) => (c.key === key ? { ...c, ...patch } : c)) });
  const anyFail = d.checks.some((c) => c.result === 'FAIL');

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    try {
      const f = await upload.mutateAsync({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', purpose: 'COMPLIANCE_DOCUMENT' });
      setDoc({ id: f.id, name: a.name });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onSubmit = async () => {
    const e: Record<string, string> = {};
    if (d.status !== 'FAIL' && d.certificate.trim().length < 3) e.certificate = 'Certificate number is required for PASS / CONDITIONAL';
    if (d.status === 'PASS' && anyFail) e.checks = 'A PASS report cannot contain failed tests — choose FAIL or CONDITIONAL';
    if (d.findings.trim().length < 5) e.findings = 'Describe your findings';
    if (d.signature.trim().length < 2) e.signature = 'Type your full name to sign';
    if (!confirmed) e.confirmed = 'Confirm the declaration';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!(await confirm({ title: `Submit ${d.status} report?`, message: d.status === 'FAIL' ? 'The job returns to in-progress for remedial work.' : 'The job will be marked complete and the certificate shared with the customer.', confirmLabel: 'Submit report' }))) return;
    submit.mutate(
      {
        complianceStatus: d.status,
        certificateNumber: d.status === 'FAIL' ? undefined : d.certificate.trim(),
        findings: d.findings.trim(),
        notes: d.notes.trim() || undefined,
        checklist: d.checks.map((c) => ({ key: c.key, label: c.label, result: c.result, reading: c.reading.trim() || undefined })),
        signatureName: d.signature.trim(),
        confirmed: true,
        attachmentIds: photos.map((p) => p.id),
        documentId: doc?.id,
      },
      {
        onSuccess: async () => {
          await AsyncStorage.removeItem(draftKey);
          toast.success(d.status === 'FAIL' ? 'Report submitted — remedial work required' : 'Job completed and certified');
          router.back();
        },
        onError: (err) => {
          if (err instanceof ApiError) setErrors(err.fieldErrors());
          toast.error(errorMessage(err));
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Inspection Report" back />
      <Screen withTabBar={false} footer={<Button label="Submit inspection report" icon="send" loading={submit.isPending} onPress={() => void onSubmit()} haptic />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="mono" color="primaryBright">{job.data?.reference}</Text>
          <Badge label="DRAFT AUTOSAVED" icon="save" tone="neutral" mono={false} />
        </View>
        <Card style={{ gap: spacing.md }}>
          <Label>Compliance outcome</Label>
          <Segmented tone="danger" value={d.status} onChange={(v) => setD({ ...d, status: v })} options={[{ value: 'PASS', label: 'PASS' }, { value: 'CONDITIONAL', label: 'CONDITIONAL' }, { value: 'FAIL', label: 'FAIL' }]} />
          {d.status !== 'FAIL' ? (
            <TextField label="Certificate of Compliance number" required value={d.certificate} onChangeText={(v) => setD({ ...d, certificate: v })} placeholder="e.g. COC-2026-000123" autoCapitalize="characters" error={errors.certificate ?? errors.certificateNumber} />
          ) : (
            <Text variant="bodySmall" color="warning">No certificate is issued for a failed inspection. The job goes back to in-progress.</Text>
          )}
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Label>Tests & checklist (SANS 10142-1)</Label>
          {errors.checks ? <Text variant="caption" color="dangerBright">{errors.checks}</Text> : null}
          {d.checks.map((c) => (
            <View key={c.key} style={styles.check}>
              <Text variant="bodySmall" weight="semibold">{c.label}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {(['PASS', 'FAIL', 'NA'] as Result[]).map((r) => (
                  <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: c.result === r }} accessibilityLabel={`${c.label} ${r}`} onPress={() => setCheck(c.key, { result: r })}
                    style={[styles.pill, c.result === r ? { backgroundColor: r === 'PASS' ? colors.success : r === 'FAIL' ? colors.danger : colors.borderStrong, borderColor: 'transparent' } : null]}>
                    <Text variant="caption" weight="bold" color={c.result === r ? 'white' : 'textMuted'}>{r}</Text>
                  </Pressable>
                ))}
                <View style={{ flex: 1 }}>
                  <TextField placeholder="Reading" value={c.reading} onChangeText={(v) => setCheck(c.key, { reading: v })} maxLength={60} />
                </View>
              </View>
            </View>
          ))}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <TextField label="Findings" required multiline value={d.findings} onChangeText={(v) => setD({ ...d, findings: v })} placeholder="Summary of the inspection and any defects…" error={errors.findings} maxLength={4000} />
          <TextField label="Additional notes" multiline value={d.notes} onChangeText={(v) => setD({ ...d, notes: v })} maxLength={2000} />
        </Card>

        <Card style={{ gap: spacing.md }}>
          <PhotoPicker value={photos} onChange={setPhotos} purpose="INSPECTION_EVIDENCE" label="Evidence photos" max={10} />
          <Label>Compliance document (PDF / photo)</Label>
          {doc ? (
            <View style={styles.doc}>
              <Icon name="file" size={18} color="primaryBright" />
              <Text variant="bodySmall" style={{ flex: 1 }} numberOfLines={1} ellipsizeMode="middle">{doc.name}</Text>
              <Pressable accessibilityLabel="Remove document" onPress={() => setDoc(null)} hitSlop={10}><Icon name="x" size={16} color="textMuted" /></Pressable>
            </View>
          ) : (
            <Button label="Attach signed certificate" icon="paperclip" variant="secondary" loading={upload.isPending} onPress={() => void pickDocument()} />
          )}
        </Card>

        <Card style={{ gap: spacing.md }}>
          <Label>Declaration</Label>
          <TextField label="Signed by (full name)" required value={d.signature} onChangeText={(v) => setD({ ...d, signature: v })} autoComplete="name" error={errors.signature ?? errors.signatureName} />
          <Checkbox checked={confirmed} onChange={setConfirmed} error={errors.confirmed} label="I declare that I inspected and tested this installation and that the results recorded are true and accurate." />
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { gap: 6, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pill: { minWidth: 48, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  doc: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surfaceInset, borderRadius: radius.md, padding: spacing.md },
});
