/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { router, type ErrorBoundaryProps } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Button, Icon, Text, colors, spacing } from '../design-system';
import { homeForRole } from '../navigation/guards';
import { useAuth } from '../store/auth';

/**
 * Branded recovery screen for Expo Router `ErrorBoundary` exports. Placed on each role layout, a
 * render error in one screen replaces only that area instead of the whole app. It uses no
 * context-dependent hooks (query client, safe area), because those providers may be what failed.
 * Development builds show the error so it is not hidden.
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const role = useAuth((s) => s.user?.role);
  const home = homeForRole(role);
  const goHome = () => {
    void retry();
    try {
      router.replace(home === '/' ? '/' : home);
    } catch {
      // Navigator unavailable (root failure): retry alone re-renders the app.
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} testID="route-error-boundary">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingTop: 64, gap: spacing.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.dangerMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="alert-triangle" size={26} color="dangerBright" />
        </View>
        <Text variant="h1">Something went wrong</Text>
        <Text variant="body" color="textSecondary">This screen hit an unexpected problem. Nothing you saved has been lost. Try again, or go back to your dashboard.</Text>
        {__DEV__ ? (
          <View style={{ backgroundColor: colors.surfaceInset, borderRadius: 10, padding: spacing.md, gap: 4 }}>
            <Text variant="label" color="warning">DEVELOPMENT DETAILS</Text>
            <Text variant="mono" color="textSecondary" selectable>{error.message}</Text>
            {error.stack ? <Text variant="caption" color="textMuted" selectable>{error.stack.split('\n').slice(0, 6).join('\n')}</Text> : null}
          </View>
        ) : null}
        <Button label="Try again" icon="refresh-cw" onPress={() => void retry()} testID="error-retry" />
        <Button label={home === '/' ? 'Return to start' : 'Return to dashboard'} icon="home" variant="secondary" onPress={goHome} testID="error-home" />
      </ScrollView>
    </View>
  );
}
