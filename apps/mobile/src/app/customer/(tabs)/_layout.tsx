/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Tabs } from 'expo-router/js-tabs';
import { makeTabBar } from '../../../components/TabBar';
import { colors } from '../../../design-system';

/**
 * Customer navigation (Part 3): the everyday journey first — Home, My jobs (incl. quotes to review),
 * a prominent Request action, Billing and Account. Rewards stays a screen of its own, reached from
 * Home, Billing and Account.
 */
const CustomerTabBar = makeTabBar([
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'jobs', label: 'My jobs', icon: 'briefcase' },
  { name: 'request', label: 'Request', icon: 'plus', href: '/customer/request', hint: 'Opens the service request form' },
  { name: 'billing', label: 'Billing', icon: 'credit-card' },
  { name: 'profile', label: 'Account', icon: 'user' },
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
