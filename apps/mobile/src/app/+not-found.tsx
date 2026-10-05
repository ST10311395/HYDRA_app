import { router } from 'expo-router';
import { View } from 'react-native';
import { BrandHeader, Screen } from '../components/layout';
import { Button, EmptyState, colors } from '../design-system';
import { homeForRole, useAuth } from '../store/auth';

/** Branded fallback for unknown deep links (e.g. an outdated notification or email link). */
export default function NotFound() {
  const role = useAuth((s) => s.user?.role);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Not found" back />
      <Screen withTabBar={false}>
        <EmptyState
          icon="compass"
          title="This page isn’t available"
          message="The link may be out of date, or this area belongs to a different account type."
          action={<Button label="Go to my home screen" icon="home" fullWidth={false} onPress={() => router.replace(homeForRole(role))} />}
        />
      </Screen>
    </View>
  );
}
