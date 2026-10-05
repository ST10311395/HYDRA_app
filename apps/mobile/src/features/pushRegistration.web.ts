/**
 * Web build of push registration. Expo push tokens exist only on iOS/Android devices, so the
 * browser never imports expo-notifications (its token listeners are unsupported on web) and
 * reports push as unavailable. In-app notifications keep working.
 */
export async function isPushEnabled(): Promise<boolean> {
  return false;
}

export async function registerForPush(): Promise<'registered' | 'disabled' | 'denied' | 'unavailable'> {
  return 'unavailable';
}

export async function unregisterPush(): Promise<void> {}

export async function setPushEnabled(_enabled: boolean): Promise<'registered' | 'disabled' | 'denied' | 'unavailable'> {
  return 'unavailable';
}
