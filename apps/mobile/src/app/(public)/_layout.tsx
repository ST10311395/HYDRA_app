import { Stack } from 'expo-router';
import { colors } from '../../design-system';
import { RouteErrorBoundary } from '../../components/RouteErrorBoundary';

export default function PublicLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

/** A crash in one screen shows a branded recovery screen for this area instead of taking down the app. */
export const ErrorBoundary = RouteErrorBoundary;
