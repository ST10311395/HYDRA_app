/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { Platform, PermissionsAndroid } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface MissedCallEntry {
  number: string;
  timestamp: number;
  durationSeconds: number;
}

interface NativeModule {
  hasPermission(): boolean;
  getMissedCallsSince(sinceMillis: number): Promise<MissedCallEntry[]>;
}

// Present only in Android development/admin builds that include this module (not in Expo Go or iOS).
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeModule>('MissedCallMonitor') : null;

/** iOS does not allow third-party apps to read the call log; the feature is Android-only by design. */
export function isMissedCallMonitorAvailable(): boolean {
  return native !== null;
}

export function hasCallLogPermission(): boolean {
  return native?.hasPermission() ?? false;
}

/** Shows the OS permission prompt. Call only after the in-app consent disclosure has been accepted. */
export async function requestCallLogPermission(): Promise<boolean> {
  if (!native) return false;
  const result = await PermissionsAndroid.request('android.permission.READ_CALL_LOG' as never, {
    title: 'Missed-call follow-up',
    message: 'Allow PSG Electrical to read missed calls on this work phone so callers receive an automatic reply.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getMissedCallsSince(sinceMillis: number): Promise<MissedCallEntry[]> {
  if (!native) return [];
  return native.getMissedCallsSince(sinceMillis);
}
