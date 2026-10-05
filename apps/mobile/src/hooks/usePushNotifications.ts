/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { registerForPush } from '../features/pushRegistration';
import { routeForNotification } from '../navigation/notificationRoutes';
import { useAuth } from '../store/auth';

export { routeForNotification };

// Native only — the web build uses usePushNotifications.web.ts and never loads expo-notifications,
// whose push-token listeners are unsupported in browsers.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Registers for push after sign-in. Permission is requested once the user is authenticated (never
 * at first launch), and only the Expo push token — no device identifiers — is sent to the API.
 */
export function usePushNotifications(): void {
  // Keyed on identity, not the user object: profile refreshes replace the object and must not
  // re-register the token or re-subscribe the listener.
  const userId = useAuth((s) => s.user?.id);
  const role = useAuth((s) => s.user?.role);
  useEffect(() => {
    if (!userId || !role) return;
    void registerForPush().catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const route = routeForNotification(role, resp.notification.request.content.data as Record<string, unknown>);
      if (route) router.push(route as never);
    });
    return () => sub.remove();
  }, [userId, role]);
}
