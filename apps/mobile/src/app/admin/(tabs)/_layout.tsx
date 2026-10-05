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
