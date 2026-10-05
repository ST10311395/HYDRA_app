/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { colors, fonts, HIT, noSelect, radius, shadow, type ColorToken } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'dangerOutline' | 'ghost' | 'violet';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  haptic?: boolean;
  testID?: string;
}

const V: Record<ButtonVariant, { bg: string; border: string; fg: ColorToken }> = {
  primary: { bg: colors.primary, border: colors.primary, fg: 'white' },
  secondary: { bg: colors.surfaceElevated, border: colors.border, fg: 'text' },
  outline: { bg: 'transparent', border: colors.borderStrong, fg: 'text' },
  danger: { bg: colors.danger, border: colors.danger, fg: 'white' },
  dangerOutline: { bg: 'rgba(227,24,55,0.08)', border: 'rgba(227,24,55,0.55)', fg: 'dangerBright' },
  ghost: { bg: 'transparent', border: 'transparent', fg: 'primaryBright' },
  violet: { bg: colors.secondaryMuted, border: colors.secondaryBorder, fg: 'secondaryBright' },
};

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, fullWidth = true, style, accessibilityHint, haptic, testID }: ButtonProps) {
  const v = V[variant];
  const inactive = disabled || loading;
  const height = size === 'lg' ? 56 : size === 'sm' ? 40 : 50;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      hitSlop={height < HIT ? (HIT - height) / 2 : undefined}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        noSelect,
        { backgroundColor: v.bg, borderColor: v.border, minHeight: height, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        variant === 'primary' && !inactive ? shadow.glow : null,
        fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[v.fg]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 18} color={v.fg} /> : null}
          <Text style={[styles.label, { fontSize: size === 'lg' ? 17 : size === 'sm' ? 13 : 15 }]} color={v.fg} numberOfLines={2} align="center">
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 15 : 18} color={v.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/** Square icon button (header phone / bell style). */
export function IconButton({ icon, onPress, label, tone = 'secondary', badge, size = 44 }: { icon: IconName; onPress: () => void; label: string; tone?: 'secondary' | 'primary' | 'danger'; badge?: boolean; size?: number }) {
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.surfaceElevated;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={size < HIT ? (HIT - size) / 2 : undefined}
      style={({ pressed }) => [styles.iconBtn, noSelect, { width: size, height: size, backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      <Icon name={icon} size={19} color="text" />
      {badge ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, maxWidth: '100%', paddingVertical: 6 },
  label: { fontFamily: fonts.bold, flexShrink: 1 },
  iconBtn: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.dangerBright, borderWidth: 1.5, borderColor: colors.background },
});
