/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, radius, spacing, type IconName } from '../design-system';

export interface QuickLink {
  icon: IconName;
  label: string;
  route: string;
  badge?: string;
}

/** Two-column grid of every operation in a role's app, so nothing is hidden behind menus. */
export function QuickLinks({ links }: { links: QuickLink[] }) {
  return (
    <View style={styles.grid}>
      {links.map((l) => (
        <Pressable
          key={l.label}
          accessibilityRole="button"
          accessibilityLabel={l.badge ? `${l.label}, ${l.badge}` : l.label}
          onPress={() => router.push(l.route as never)}
          style={({ pressed }) => [styles.item, pressed ? { opacity: 0.85 } : null]}
        >
          <Icon name={l.icon} size={17} color="primaryBright" />
          <Text variant="bodySmall" weight="semibold" style={{ flex: 1 }}>{l.label}</Text>
          {l.badge ? <View style={styles.badge}><Text variant="caption" weight="bold" color="white">{l.badge}</Text></View> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
});
