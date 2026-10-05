/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Stack } from 'expo-router';
import { colors } from '../design-system';
import { useAuth } from '../store/auth';
import { routeAccess } from './guards';

/**
 * Root navigator. Each role area is mounted only while the API-issued session role allows it
 * (`Stack.Protected`), so changing a URL or navigation parameter cannot open another role's app.
 * When a guard turns off (sign-in, sign-out, expired session) the screen is removed and the
 * navigator falls back to `index`, which routes to the correct place for the new session.
 */
export function AppStack() {
  const status = useAuth((s) => s.status);
  const role = useAuth((s) => s.user?.role);
  const access = routeAccess(status, role);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ animation: 'none' }} />
      <Stack.Protected guard={access.welcome}>
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Screen name="(public)" />
      <Stack.Protected guard={access.auth}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={access.customer}>
        <Stack.Screen name="customer" />
      </Stack.Protected>
      <Stack.Protected guard={access.employee}>
        <Stack.Screen name="employee" />
      </Stack.Protected>
      <Stack.Protected guard={access.admin}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
    </Stack>
  );
}
