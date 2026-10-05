/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { phone as phoneSchema } from '@hydra/shared';
import { ApiError, api } from '../api/client';
import { getMissedCallsSince, hasCallLogPermission, isMissedCallMonitorAvailable } from '../../modules/missed-call-monitor';

const LAST_SYNC_KEY = 'hydra.missedCalls.lastSync';
const FIRST_SYNC_WINDOW_MS = 24 * 3_600_000;
/** Must match MAX_BATCH in MissedCallMonitorModule.kt. */
const NATIVE_BATCH = 100;
const MAX_PAGES = 10;

export interface SyncResult {
  found: number;
  logged: number;
  skipped: number;
}

/**
 * Reads missed calls from the Android call log (only after consent + OS permission) and sends the
 * minimum data — number, time, ring duration — to the API, which runs the auto-response workflow.
 * Contact names and the address book are never read or uploaded (spec §11 data minimisation).
 */
export async function syncMissedCalls(now = Date.now()): Promise<SyncResult> {
  if (Platform.OS !== 'android' || !isMissedCallMonitorAvailable()) throw new Error('Missed-call monitoring is only available in the Android admin build.');
  if (!hasCallLogPermission()) throw new Error('Call-log permission has not been granted on this device.');
  let since = now - FIRST_SYNC_WINDOW_MS;
  try {
    const stored = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (stored && Number.isFinite(Number(stored))) since = Number(stored);
  } catch {
    // Storage unavailable — fall back to the last 24 hours.
  }
  const deviceId = Application.getAndroidId?.() ?? undefined;
  let found = 0;
  let logged = 0;
  let skipped = 0;
  let newest = since;
  // The native module returns oldest-first batches of up to NATIVE_BATCH; page until drained.
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const calls = await getMissedCallsSince(newest);
    found += calls.length;
    for (const c of [...calls].sort((a, b) => a.timestamp - b.timestamp)) {
      if (!phoneSchema.safeParse(c.number).success) {
        skipped += 1; // Private / withheld numbers cannot be replied to.
      } else {
        try {
          await api.post('/missed-calls', { phoneNumber: c.number, callAt: new Date(c.timestamp).toISOString(), durationSeconds: Math.max(0, Math.round(c.durationSeconds)), deviceId, source: 'DEVICE_MONITOR' });
          logged += 1;
        } catch (e) {
          // A 409 means this call was already logged; anything else stops the sync so it can be retried.
          if (e instanceof ApiError && e.status === 409) skipped += 1;
          else throw e;
        }
      }
      newest = Math.max(newest, c.timestamp + 1);
      await saveCursor(newest);
    }
    if (calls.length < NATIVE_BATCH) break;
  }
  return { found, logged, skipped };
}

async function saveCursor(value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(value));
  } catch {
    // Non-fatal: the next sync may re-send calls, which the API de-duplicates.
  }
}
