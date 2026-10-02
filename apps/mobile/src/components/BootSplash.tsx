import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Icon, colors, radius, spacing } from '../design-system';

/**
 * Branded placeholder shown while fonts load and the stored session is restored, so the public
 * home page never flashes before the user's role is known. Uses system fonts on purpose: the
 * brand fonts may not be loaded yet.
 */
export function BootSplash() {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="Loading PSG Electrical" testID="boot-splash">
      <View style={styles.logo}>
        <Icon name="zap" size={36} color="white" />
      </View>
      <Text style={styles.title}>PSG Electrical</Text>
      <Text style={styles.subtitle}>& Cables · Trite Solar</Text>
      <ActivityIndicator color={colors.primaryBright} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl },
  logo: { width: 76, height: 76, borderRadius: radius.xl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4, textAlign: 'center' },
});
