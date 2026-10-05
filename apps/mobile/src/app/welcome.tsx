/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { imageFor } from '../components/images';
import { Button, Icon, Label, Text, colors, radius, spacing, type IconName } from '../design-system';
import { useAuth } from '../store/auth';

const HIGHLIGHTS: { icon: IconName; text: string }[] = [
  { icon: 'activity', text: 'Request services and follow your electrician live' },
  { icon: 'file-text', text: 'Approve quotes, pay invoices and earn rewards' },
  { icon: 'shield', text: 'Certificates of Compliance in one place' },
];

/**
 * Welcome / auth gateway — first screen for signed-out visitors. One secure sign-in serves every
 * role; the API decides which app (customer, electrician, office, owner) opens afterwards.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const continueAsGuest = useAuth((s) => s.continueAsGuest);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + spacing.xl }}
      bounces={false}
    >
      <View style={[styles.hero, styles.column, { paddingTop: insets.top + spacing.lg }]}>
        <Image source={imageFor('hero-substation')} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
        <LinearGradient colors={['rgba(11,15,22,0.35)', 'rgba(11,15,22,0.7)', colors.background]} style={StyleSheet.absoluteFill} />
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Icon name="zap" size={26} color="white" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h3">PSG Electrical</Text>
            <Text variant="caption" color="textSecondary">& Cables · Trite Solar</Text>
          </View>
          <View style={styles.hydra}>
            <Label color="primaryBright" style={{ fontSize: 10 }}>HYDRA</Label>
          </View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Label color="primaryBright">Electrical · Solar · Compliance</Label>
          <Text variant="display" accessibilityRole="header">Power, managed{'\n'}end to end.</Text>
          <Text variant="body" color="textSecondary">
            Service requests, live job tracking, quotes, invoices and rewards — plus the field and office tools our team runs on.
          </Text>
        </View>
      </View>

      <View style={[styles.body, styles.column]}>
        <View style={{ gap: spacing.md }}>
          {HIGHLIGHTS.map((h) => (
            <View key={h.text} style={styles.highlight}>
              <Icon name={h.icon} size={16} color="primaryBright" />
              <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>{h.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.md }}>
          <Button label="Sign In" icon="log-in" size="lg" onPress={() => router.push('/login')} testID="welcome-sign-in" />
          <Button label="Create Account" icon="user-plus" variant="secondary" size="lg" onPress={() => router.push('/register')} testID="welcome-register" />
          <Button
            label="Continue as Guest"
            iconRight="arrow-right"
            variant="ghost"
            onPress={() => {
              continueAsGuest();
              router.replace('/home');
            }}
            accessibilityHint="Browse services, projects and request a quotation without an account"
            testID="welcome-guest"
          />
        </View>

        <View style={styles.staffNote}>
          <Icon name="briefcase" size={16} color="secondaryBright" />
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            Electricians and office staff use the same Sign In with their staff email or staff number — your workspace opens automatically.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Phone-first layout; on tablets/desktop web the content stays a readable centred column.
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { minHeight: 360, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, justifyContent: 'space-between', gap: spacing.xxl, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  hydra: { borderWidth: 1, borderColor: colors.primaryBorder, backgroundColor: 'rgba(11,15,22,0.6)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  body: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xxl, justifyContent: 'space-between' },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  staffNote: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
});
