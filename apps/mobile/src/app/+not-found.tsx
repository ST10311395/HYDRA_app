/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
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
