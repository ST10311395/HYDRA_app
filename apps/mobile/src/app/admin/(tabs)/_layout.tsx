/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Tabs } from 'expo-router/js-tabs';
import { makeTabBar } from '../../../components/TabBar';
import { colors } from '../../../design-system';

const AdminTabBar = makeTabBar([
  { name: 'index', label: 'Dashboard', icon: 'activity' },
  { name: 'enquiries', label: 'Enquiries', icon: 'inbox' },
  { name: 'jobs', label: 'Jobs', icon: 'briefcase' },
  { name: 'workforce', label: 'Workforce', icon: 'users' },
  { name: 'more', label: 'More', icon: 'menu' },
]);

/** Operations centre navigation (spec §10): tabs + a “More” menu for finance, inventory, reports and settings. */
export default function AdminTabs() {
  return (
    <Tabs tabBar={(p) => <AdminTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="enquiries" />
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="workforce" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
