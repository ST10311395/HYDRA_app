import { Tabs } from 'expo-router/js-tabs';
import { makeTabBar } from '../../../components/TabBar';
import { colors } from '../../../design-system';

const PublicTabBar = makeTabBar([
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'services', label: 'Services', icon: 'tool' },
  { name: 'work', label: 'Work', icon: 'briefcase' },
  { name: 'quote', label: 'Quote', icon: 'file-text' },
  { name: 'contact', label: 'Contact', icon: 'phone' },
]);

/** Guest / marketing navigation — Home · Services · Work · Quote · Contact (wireframe pattern). */
export default function PublicTabs() {
  return (
    <Tabs tabBar={(props) => <PublicTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="services" />
      <Tabs.Screen name="work" />
      <Tabs.Screen name="quote" />
      <Tabs.Screen name="contact" />
    </Tabs>
  );
}
