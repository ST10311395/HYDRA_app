/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Label, Text } from './Text';
import { colors, noSelect, radius, spacing, type ColorToken } from './tokens';

type Accent = 'none' | 'primary' | 'secondary' | 'danger' | 'success';

const ACCENT_BORDER: Record<Accent, string> = {
  none: colors.border,
  primary: colors.primaryBorder,
  secondary: colors.secondaryBorder,
  danger: 'rgba(227,24,55,0.5)',
  success: 'rgba(44,203,140,0.45)',
};

/** Graphite card with restrained radius and optional accent border (wireframe card pattern). */
export function Card({
  children,
  accent = 'none',
  elevated,
  padded = true,
  style,
  onPress,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  accent?: Accent;
  elevated?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const s = [
    styles.card,
    { borderColor: ACCENT_BORDER[accent], backgroundColor: elevated ? colors.surfaceElevated : colors.surface },
    padded ? { padding: spacing.lg } : null,
    style,
  ];
  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [...s, noSelect, pressed ? { opacity: 0.88 } : null]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={s}>
      {children}
    </View>
  );
}

type Tone = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'neutral';

const TONES: Record<Tone, { bg: string; border: string; fg: ColorToken }> = {
  primary: { bg: colors.primaryMuted, border: colors.primaryBorder, fg: 'primaryBright' },
  secondary: { bg: colors.secondaryMuted, border: colors.secondaryBorder, fg: 'secondaryBright' },
  danger: { bg: colors.dangerMuted, border: 'rgba(227,24,55,0.5)', fg: 'dangerBright' },
  success: { bg: colors.successMuted, border: 'rgba(44,203,140,0.45)', fg: 'success' },
  warning: { bg: colors.warningMuted, border: 'rgba(244,183,64,0.45)', fg: 'warning' },
  neutral: { bg: colors.surfaceElevated, border: colors.border, fg: 'textSecondary' },
};

/** Pill badge. `mono` renders the technical uppercase style (e.g. “COMPLETED”, “132kV / 40MVA”). */
export function Badge({ label, tone = 'neutral', icon, mono = true, solid }: { label: string; tone?: Tone; icon?: IconName; mono?: boolean; solid?: boolean }) {
  const t = TONES[tone];
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: solid ? (tone === 'primary' ? colors.primary : colors.backgroundDeep) : t.bg, borderColor: solid ? 'transparent' : t.border }]}
    >
      {icon ? <Icon name={icon} size={12} color={solid ? 'white' : t.fg} /> : null}
      {mono ? (
        <Label color={solid ? 'white' : t.fg} style={styles.badgeText} numberOfLines={2}>
          {label}
        </Label>
      ) : (
        <Text variant="caption" color={solid ? 'white' : t.fg} weight="semibold" numberOfLines={2} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      )}
    </View>
  );
}

/** “// SECTION TITLE” header with optional right-hand action link. */
export function SectionHeader({ title, subtitle, actionLabel, onAction, tag, icon }: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void; tag?: string; icon?: IconName }) {
  return (
    <View style={styles.section}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Icon name={icon} size={18} color="primaryBright" /> : null}
          <Text variant="h3" accessibilityRole="header" uppercase={!icon}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text variant="bodySmall" color="textMuted">{subtitle}</Text> : null}
      </View>
      {tag ? <Badge label={tag} tone="primary" /> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text variant="title" color="primaryBright">{actionLabel}</Text>
          <Icon name="chevron-right" size={16} color="primaryBright" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function MonoHeading({ children, color = 'textMuted', right }: { children: string; color?: ColorToken; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Label color={color} style={{ fontSize: 13, letterSpacing: 2 }}>{children}</Label>
      {right}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

/** Key figure tile (e.g. “15+ / Years Experience”). */
export function StatTile({ value, label, caption, accent = 'primary', icon }: { value: string; label?: string; caption?: string; accent?: 'primary' | 'secondary' | 'neutral'; icon?: IconName }) {
  const c: ColorToken = accent === 'primary' ? 'primaryBright' : accent === 'secondary' ? 'secondaryBright' : 'text';
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label ?? ''} ${caption ?? ''}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="stat" color={c} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
        {icon ? <Icon name={icon} size={16} color="textMuted" /> : null}
      </View>
      {label ? <Text variant="title" weight="bold">{label}</Text> : null}
      {caption ? <Text variant="caption" color="textMuted">{caption}</Text> : null}
    </View>
  );
}

export function IconTile({ icon, tone = 'primary', size = 44 }: { icon: IconName; tone?: 'primary' | 'secondary' | 'danger' | 'neutral'; size?: number }) {
  const bg = tone === 'primary' ? colors.primaryMuted : tone === 'secondary' ? colors.secondaryMuted : tone === 'danger' ? colors.dangerMuted : colors.surfaceElevated;
  const fg: ColorToken = tone === 'primary' ? 'primaryBright' : tone === 'secondary' ? 'secondaryBright' : tone === 'danger' ? 'dangerBright' : 'text';
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: bg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.45} color={fg} />
    </View>
  );
}

export function KeyValue({ label, value, valueColor = 'text', mono }: { label: string; value: string; valueColor?: ColorToken; mono?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text variant="bodySmall" color="textMuted" style={{ flex: 1 }}>{label}</Text>
      <Text variant={mono ? 'mono' : 'title'} color={valueColor} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', maxWidth: '100%', flexShrink: 1 },
  badgeText: { fontSize: 11, letterSpacing: 1, flexShrink: 1 },
  section: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 4, minHeight: 104 },
  kv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
});
