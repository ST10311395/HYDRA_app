import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { errorMessage } from '../../../api/client';
import { useJob, useQr } from '../../../api/queries';
import { BrandHeader, Screen } from '../../../components/layout';
import { Button, Card, EmptyState, ErrorState, Icon, Label, LoadingCards, Text, colors, radius, spacing } from '../../../design-system';
import { useKeepScreenAwake } from '../../../hooks/useKeepScreenAwake';
import { useJobSubscription } from '../../../hooks/useRealtime';
import { jobStatusLabel } from '../../../utils/format';

/** Rotate this long before the server-side expiry so the code shown is never already dead. */
const ROTATE_EARLY_MS = 5_000;

/** Seconds until `expiresAt`, ticking once a second only while a code is on screen. */
function useCountdown(expiresAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000)) : 0;
}

/**
 * Secure, short-lived arrival QR (spec §8.5). The token is opaque and rotates. The screen is kept
 * awake, the countdown runs and tokens are minted only while this screen is focused; leaving it
 * stops every timer and releases the wake lock.
 */
export default function ArrivalQr() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const focused = useIsFocused();
  const job = useJob(id);
  useJobSubscription(id || undefined);
  const scheduled = job.data?.status === 'SCHEDULED';
  const arrived = job.data?.status === 'IN_PROGRESS' || !!job.data?.checkins.length;
  const showing = focused && scheduled && !arrived;
  const qr = useQr(id, showing);
  useKeepScreenAwake(showing);

  const expiresAt = showing ? qr.data?.expiresAt : undefined;
  const remaining = useCountdown(expiresAt);
  const { refetch } = qr;
  // One rotation per token. A failed refresh leaves the same expiresAt, so it shows the error
  // with Retry instead of re-requesting in a loop.
  useEffect(() => {
    if (!expiresAt) return;
    const t = setTimeout(() => void refetch(), Math.max(0, Date.parse(expiresAt) - Date.now() - ROTATE_EARLY_MS));
    return () => clearTimeout(t);
  }, [expiresAt, refetch]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Arrival QR" back />
      <Screen withTabBar={false}>
        {!id ? (
          <EmptyState icon="alert-circle" title="Job not found" message="Open the Arrival QR from one of your scheduled jobs." action={<Button label="My jobs" onPress={() => router.replace('/customer/jobs')} />} />
        ) : job.isLoading ? <LoadingCards /> : job.isError ? (
          <ErrorState message={errorMessage(job.error)} onRetry={() => void job.refetch()} />
        ) : arrived ? (
          <Card accent="success" style={{ alignItems: 'center', gap: spacing.md }}>
            <Icon name="check-circle" size={48} color="success" />
            <Text variant="h2" align="center">Arrival confirmed</Text>
            <Text variant="bodySmall" color="textMuted" align="center">Your electrician has checked in. Follow progress on the live timeline.</Text>
            <Button label="View live timeline" onPress={() => router.replace(`/customer/job/${id}`)} />
          </Card>
        ) : !scheduled ? (
          <EmptyState
            icon="clock"
            title="QR not available yet"
            message={`This job is ${job.data ? jobStatusLabel(job.data.status).toLowerCase() : 'not scheduled'}. A QR code becomes available once your job is scheduled.`}
            action={<Button label="View job" variant="secondary" onPress={() => router.replace(`/customer/job/${id}`)} />}
          />
        ) : qr.isError ? (
          <ErrorState message={errorMessage(qr.error)} onRetry={() => void refetch()} />
        ) : (
          <Card style={{ alignItems: 'center', gap: spacing.lg }}>
            <Label color="primaryBright">{job.data?.reference}</Label>
            <Text variant="h2" align="center">Show this to your electrician</Text>
            <View style={styles.qrWrap} accessibilityLabel="Arrival QR code" testID="arrival-qr">
              {qr.data ? <QRCode value={qr.data.payload} size={240} backgroundColor="#FFFFFF" color="#0B0F16" ecl="M" /> : <LoadingCards count={1} />}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="refresh-cw" size={14} color="textMuted" />
              <Text variant="caption" color="textMuted">
                {qr.isFetching ? 'Refreshing code…' : `Refreshes automatically · expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
              </Text>
            </View>
            <Text variant="caption" color="textFaint" align="center">This code is unique to this visit and only works for your assigned electrician. Never share it by message.</Text>
            <Button label="Refresh code now" variant="secondary" icon="refresh-cw" loading={qr.isFetching} onPress={() => void refetch()} />
          </Card>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  qrWrap: { padding: 18, backgroundColor: '#FFFFFF', borderRadius: radius.lg, minWidth: 276, minHeight: 276, alignItems: 'center', justifyContent: 'center' },
});
