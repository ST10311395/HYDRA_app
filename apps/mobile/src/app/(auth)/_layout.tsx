/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Stack } from 'expo-router';
import { colors } from '../../design-system';
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

/** A crash in one screen shows a branded recovery screen for this area instead of taking down the app. */
export const ErrorBoundary = RouteErrorBoundary;
