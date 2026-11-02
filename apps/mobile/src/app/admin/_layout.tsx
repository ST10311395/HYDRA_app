/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Stack } from 'expo-router';
import { colors } from '../../design-system';
import { useIsOwner } from '../../components/admin';
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary';
import { OWNER_ONLY_PATHS } from '../../navigation/guards';

/**
 * Admin area. Owner-only modules are not routable for office admins: a deep link to one falls back to
 * the dashboard. Defence in depth — each owner screen also renders OwnerGate, and the API enforces
 * ADMIN_OWNER on the matching endpoints.
 */
export default function AdminLayout() {
  const owner = useIsOwner();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={owner}>
        {OWNER_ONLY_PATHS.map((p) => <Stack.Screen key={p} name={p.replace('/admin/', '')} />)}
      </Stack.Protected>
    </Stack>
  );
}

/** A crash in one screen shows a branded recovery screen for this area instead of taking down the app. */
export const ErrorBoundary = RouteErrorBoundary;
