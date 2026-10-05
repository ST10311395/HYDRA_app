/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { routeForNotification } from '../navigation/notificationRoutes';

export { routeForNotification };

/**
 * Web build: push notifications are delivered to the installed iOS/Android apps only. Browsers
 * still get in-app notifications (Notifications screen + realtime updates), so nothing registers here.
 */
export function usePushNotifications(): void {}
