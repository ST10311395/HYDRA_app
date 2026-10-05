/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text, colors, type IconName } from '../design-system';

export interface TabSpec {
  name: string;
  label: string;
  icon: IconName;
}

/** Persistent five-item bottom navigation matching the wireframes (Home · Services · Work · Quote · Contact). */
export function makeTabBar(tabs: TabSpec[]) {
  return function TabBar({ state, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const visible = tabs.filter((t) => state.routes.some((r) => r.name === t.name));
    return (
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
        {visible.map((tab) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
          const route = state.routes[routeIndex]!;
          const focused = state.index === routeIndex;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync();
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={styles.item}
            >
              <Icon name={tab.icon} size={22} color={focused ? 'white' : 'textMuted'} />
              <Text variant="caption" color={focused ? 'white' : 'textMuted'} weight={focused ? 'bold' : 'medium'} style={{ fontSize: 11 }} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.backgroundDeep, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 },
});
