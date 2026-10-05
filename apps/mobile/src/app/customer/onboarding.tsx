import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthUser } from '@hydra/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button, Icon, Label, ProgressBar, Text, colors, radius, spacing, type IconName } from '../../design-system';
import { useAuth } from '../../store/auth';

const SLIDES: { icon: IconName; title: string; body: string; tone: 'primary' | 'secondary' }[] = [
  { icon: 'plus-circle', title: 'Request a job in seconds', body: 'Choose a service, add the site address and photos. It lands straight on the office dispatch board.', tone: 'primary' },
  { icon: 'file-text', title: 'Review & accept quotes', body: 'See labour, materials and VAT separately before you commit. Accept or decline right in the app.', tone: 'secondary' },
  { icon: 'activity', title: 'Track progress live', body: 'Show your QR code when the electrician arrives, then watch every milestone through to your Certificate of Compliance.', tone: 'primary' },
  { icon: 'gift', title: 'Earn rewards', body: 'Pay invoices securely in the app and earn points you can redeem for discounts on future work.', tone: 'secondary' },
];

/** Guided walkthrough shown once after sign-up (PDF Story 23). */
export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const setUser = useAuth((s) => s.setUser);
  const qc = useQueryClient();
  const slide = SLIDES[i]!;
  const finish = async () => {
    setBusy(true);
    try {
      setUser(await api.post<AuthUser>('/profile/onboarding-complete'));
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    } finally {
      setBusy(false);
      router.replace('/customer');
    }
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label color="primaryBright">Welcome to PSG Electrical</Label>
        <Button label="Skip" variant="ghost" size="sm" fullWidth={false} onPress={() => void finish()} />
      </View>
      <ProgressBar value={(i + 1) / SLIDES.length} />
      <View style={styles.center} accessibilityLiveRegion="polite">
        <View style={[styles.icon, { backgroundColor: slide.tone === 'primary' ? colors.primaryMuted : colors.secondaryMuted }]}>
          <Icon name={slide.icon} size={48} color={slide.tone === 'primary' ? 'primaryBright' : 'secondaryBright'} />
        </View>
        <Text variant="display" align="center">{slide.title}</Text>
        <Text variant="body" color="textMuted" align="center">{slide.body}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {SLIDES.map((_, k) => <View key={k} style={[styles.dot, k === i ? { backgroundColor: colors.primaryBright, width: 22 } : null]} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {i > 0 ? <Button label="Back" variant="secondary" fullWidth={false} onPress={() => setI(i - 1)} /> : null}
        <Button label={i === SLIDES.length - 1 ? 'Get started' : 'Next'} iconRight="arrow-right" style={{ flex: 1 }} loading={busy} onPress={() => (i === SLIDES.length - 1 ? void finish() : setI(i + 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, gap: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  icon: { width: 120, height: 120, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
});
