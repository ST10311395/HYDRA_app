import { Tabs } from 'expo-router/js-tabs';
import { makeTabBar } from '../../../components/TabBar';
import { colors } from '../../../design-system';

const EmployeeTabBar = makeTabBar([
  { name: 'index', label: 'Today', icon: 'sun' },
  { name: 'calendar', label: 'Calendar', icon: 'calendar' },
  { name: 'scan', label: 'Scan', icon: 'maximize' },
  { name: 'timesheet', label: 'Timesheet', icon: 'clock' },
  { name: 'profile', label: 'Profile', icon: 'user' },
]);

/** Field-optimised navigation for electricians (spec §9). */
export default function EmployeeTabs() {
  return (
    <Tabs tabBar={(p) => <EmployeeTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="timesheet" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
