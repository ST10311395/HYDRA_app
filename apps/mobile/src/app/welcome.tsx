/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandBackdrop } from '../components/BrandBackdrop';
import { BrandLogo } from '../components/BrandLogo';
import { Button, Icon, Text, colors, radius, spacing } from '../design-system';
import { useAuth } from '../store/auth';

/**
 * Welcome / auth gateway — first screen for signed-out visitors. One secure sign-in serves every
 * role; the API decides which app (customer, electrician, office, owner) opens afterwards.
 * Order (Part 3 client request): logo and name → short welcome → Sign In → Create Account / Guest.
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const continueAsGuest = useAuth((s) => s.continueAsGuest);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.huge, paddingBottom: insets.bottom + spacing.xl }}
      bounces={false}
    >
      <BrandBackdrop height={260} />
      <View style={[styles.column, styles.body]}>
        <View style={styles.brand}>
          <BrandLogo size={88} decorative />
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="h2" align="center">PSG Electrical & Cables</Text>
            <Text variant="bodySmall" color="textMuted" align="center">Innovation-driven electrical solutions</Text>
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="h1" align="center" accessibilityRole="header">Welcome</Text>
          <Text variant="body" color="textSecondary" align="center">
            Request a service, review quotes, follow your jobs and pay invoices in one place.
          </Text>
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
            accessibilityHint="Browse services and request a quotation without an account"
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
  body: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.xxxl, justifyContent: 'space-between' },
  brand: { alignItems: 'center', gap: spacing.lg },
  staffNote: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
});
