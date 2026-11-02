/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../design-system';
import { LogoLockup } from './LogoLockup';

/**
 * Branded placeholder shown while fonts load and the stored session is restored, so the public
 * home page never flashes before the user's role is known. Image only (no text), so it never
 * depends on the brand fonts having loaded.
 */
export function BootSplash() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading PSG Electrical" testID="boot-splash">
      <LogoLockup maxWidth={300} />
      <ActivityIndicator color={colors.primaryBright} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl },
});
