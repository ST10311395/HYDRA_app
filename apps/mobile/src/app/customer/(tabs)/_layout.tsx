import { Tabs } from 'expo-router/js-tabs';
import { makeTabBar } from '../../../components/TabBar';
import { colors } from '../../../design-system';

const CustomerTabBar = makeTabBar([
  { name: 'index', label: 'Dashboard', icon: 'grid' },
  { name: 'jobs', label: 'Jobs', icon: 'briefcase' },
  { name: 'rewards', label: 'Rewards', icon: 'gift' },
  { name: 'billing', label: 'Billing', icon: 'credit-card' },
  { name: 'profile', label: 'Profile', icon: 'user' },
]);

export default function CustomerTabs() {
  return (
    <Tabs tabBar={(p) => <CustomerTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="rewards" />
      <Tabs.Screen name="billing" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
