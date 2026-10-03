import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import type { JobDetailDto } from '@hydra/shared';
import { api, errorMessage } from '../../../api/client';
import { usePublicContent } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Button, Card, Icon, Label, Text, colors, radius, spacing, toast } from '../../../design-system';
import { cameraSupport, captureArrivalLocation, describeCheckinError, parseHydraQr } from '../../../features/checkin';
import { callNumber } from '../../../utils/links';

type Phase = { kind: 'scanning' } | { kind: 'locating'; jobId: string } | { kind: 'submitting'; jobId: string } | { kind: 'done'; job: JobDetailDto; shiftStarted: boolean } | { kind: 'error'; message: string; code?: string };

/** QR arrival flow (spec §9.4): camera → customer QR → GPS fix → server validates token + assignment → IN_PROGRESS. */
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [failures, setFailures] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [support] = useState(cameraSupport);
  const locked = useRef(false);
  const qc = useQueryClient();
  const content = usePublicContent();

  const onScan = async (data: string) => {
    if (locked.current) return;
    locked.current = true;
    const parsed = parseHydraQr(data);
    if (!parsed) {
      setFailures((f) => f + 1);
      setPhase({ kind: 'error', message: 'This is not a PSG Electrical job QR code.', code: 'QR_INVALID' });
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase({ kind: 'locating', jobId: parsed.jobId });
    const gps = await captureArrivalLocation();
    if (!gps.ok) {
      setPhase({ kind: 'error', message: gps.message, code: gps.reason === 'denied' ? 'LOCATION_DENIED' : 'LOCATION_UNAVAILABLE' });
      return;
    }
    setPhase({ kind: 'submitting', jobId: parsed.jobId });
    try {
      const res = await api.post<{ job: JobDetailDto; shiftStarted: boolean }>(`/jobs/${parsed.jobId}/checkin`, {
        qrToken: parsed.payload,
        location: { latitude: gps.latitude, longitude: gps.longitude, accuracy: gps.accuracy },
      });
      qc.setQueryData(['job', res.job.id], res.job);
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
      setFailures(0);
      setPhase({ kind: 'done', job: res.job, shiftStarted: res.shiftStarted });
    } catch (e) {
      setFailures((f) => f + 1);
      setPhase({ kind: 'error', message: errorMessage(e), code: (e as { code?: string }).code });
    }
  };

  const reset = () => {
    locked.current = false;
    setPhase({ kind: 'scanning' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Scan Arrival QR" />
      <Screen>
        {support !== 'ok' ? (
          <Card style={{ gap: spacing.md }} testID="scan-unsupported">
            <Icon name="camera-off" size={28} color="warning" />
            <Text variant="h3">Camera scanning isn’t available here</Text>
            <Text variant="bodySmall" color="textMuted">
              {support === 'insecure'
                ? 'This browser only allows camera access on secure (https) pages. Use the PSG Electrical phone app to scan the customer’s arrival QR.'
                : 'This browser does not provide camera access. Use the PSG Electrical phone app to scan the customer’s arrival QR.'}
            </Text>
            <Text variant="caption" color="textMuted">If you are on site without the app, the office can confirm your arrival manually.</Text>
            <Button label="Call the office for manual confirmation" icon="phone-call" variant="secondary" onPress={() => content.data && void callNumber(content.data.company.hotline)} />
          </Card>
        ) : !permission ? (
          <Card style={{ gap: spacing.sm }} testID="scan-permission-loading">
            <Icon name="camera" size={24} color="textMuted" />
            <Text variant="title">Checking camera access…</Text>
          </Card>
        ) : !permission.granted ? (
          <Card style={{ gap: spacing.md }} testID={`scan-permission-${permission.canAskAgain ? permission.status : 'blocked'}`}>
            <Icon name="camera" size={28} color="primaryBright" />
            <Text variant="h3">{permission.status === 'undetermined' ? 'Camera access needed' : permission.canAskAgain ? 'Camera access was declined' : 'Camera access is turned off'}</Text>
            <Text variant="bodySmall" color="textMuted">The camera is used only to scan the customer’s job QR code when you arrive. Your location is recorded once, at the moment of check-in, as proof of attendance.</Text>
            {permission.canAskAgain ? (
              <Button label={permission.status === 'undetermined' ? 'Allow camera' : 'Ask again'} icon="camera" onPress={() => void requestPermission().catch(() => toast.error('Camera permission could not be requested.'))} />
            ) : Platform.OS === 'web' ? (
              <Text variant="bodySmall" color="textSecondary">Allow the camera for this site in your browser’s site settings, then reload the page.</Text>
            ) : (
              <Button label="Open settings" icon="settings" onPress={() => void Linking.openSettings().catch(() => toast.info('Open Settings › Apps › PSG Electrical › Permissions › Camera.'))} />
            )}
          </Card>
        ) : cameraError ? (
          <Card accent="danger" style={{ gap: spacing.md }} testID="scan-camera-error">
            <Icon name="camera-off" size={28} color="dangerBright" />
            <Text variant="h3">Camera unavailable</Text>
            <Text variant="bodySmall" color="textMuted">{cameraError}</Text>
            <Button label="Try the camera again" icon="refresh-cw" onPress={() => setCameraError(null)} />
            <Button label="Call the office for manual confirmation" icon="phone-call" variant="secondary" onPress={() => content.data && void callNumber(content.data.company.hotline)} />
          </Card>
        ) : phase.kind === 'done' ? (
          <Card accent="success" style={{ gap: spacing.md, alignItems: 'center' }}>
            <Icon name="check-circle" size={52} color="success" />
            <Text variant="h2" align="center">Arrival confirmed</Text>
            <Text variant="body" color="textMuted" align="center">{phase.job.reference} · {phase.job.serviceType.name}</Text>
            {phase.shiftStarted ? <Text variant="bodySmall" color="success">Your shift was started automatically.</Text> : null}
            <Button label="Open job" iconRight="arrow-right" onPress={() => { reset(); router.push(`/employee/job/${phase.job.id}`); }} />
            <Button label="Scan another" variant="ghost" onPress={reset} />
          </Card>
        ) : (
          <>
            <View style={styles.camera}>
              {focused && phase.kind === 'scanning' ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(r) => void onScan(r.data)}
                  onMountError={(e) => setCameraError(e.message || 'The camera could not be started. Another app may be using it.')}
                />
              ) : null}
              <View style={[styles.frame, { pointerEvents: 'none' }]} />
              {phase.kind !== 'scanning' && phase.kind !== 'error' ? (
                <View style={styles.overlay}>
                  <Icon name={phase.kind === 'locating' ? 'map-pin' : 'upload-cloud'} size={32} color="primaryBright" />
                  <Text variant="title">{phase.kind === 'locating' ? 'Capturing GPS location…' : 'Confirming arrival…'}</Text>
                </View>
              ) : null}
            </View>
            {phase.kind === 'scanning' ? (
              <Card style={{ gap: 6 }}>
                <Label color="primaryBright">How it works</Label>
                <Text variant="bodySmall" color="textSecondary">Ask the customer to open their job in the PSG Electrical app and tap “Show arrival QR code”. Point your camera at it.</Text>
              </Card>
            ) : null}
            {phase.kind === 'error' ? <ScanProblem phase={phase} failures={failures} onRetry={reset} hotline={content.data?.company.hotline} /> : null}
          </>
        )}
      </Screen>
    </View>
  );
}

function ScanProblem({ phase, failures, onRetry, hotline }: { phase: { message: string; code?: string }; failures: number; onRetry: () => void; hotline?: string }) {
  const p = describeCheckinError(phase.code, phase.message);
  return (
    <Card accent="danger" style={{ gap: spacing.md }} testID={`scan-error-${phase.code ?? 'unknown'}`}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Icon name="alert-triangle" size={20} color="dangerBright" />
        <Text variant="title" weight="bold" style={{ flex: 1 }}>{p.title}</Text>
      </View>
      <Text variant="bodySmall" color="textSecondary">{p.message}</Text>
      {p.hint ? <Text variant="caption" color="textMuted">{p.hint}</Text> : null}
      {p.final ? (
        <Button label="Back to today’s jobs" icon="arrow-left" onPress={() => { onRetry(); router.navigate('/employee'); }} />
      ) : (
        <Button label="Scan again" icon="refresh-cw" onPress={onRetry} />
      )}
      {failures >= 2 && hotline ? <Button label="Call the office for manual confirmation" icon="phone-call" variant="secondary" onPress={() => void callNumber(hotline)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  camera: { height: 360, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 230, height: 230, borderWidth: 3, borderColor: colors.primaryBright, borderRadius: radius.lg },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(11,15,22,0.85)', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});
