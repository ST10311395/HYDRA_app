/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { activateKeepAwakeAsync, deactivateKeepAwake, isAvailableAsync } from 'expo-keep-awake';
import { useEffect } from 'react';

let nextTag = 0;

/**
 * Keeps the screen awake while `active` is true (e.g. while the Arrival QR is focused).
 *
 * Replaces `useKeepAwake()`, whose cleanup always calls `deactivateKeepAwake`. On the web that
 * rejects with "The wake lock with tag … has not activated yet" whenever activation never
 * succeeded — e.g. a phone browser on plain-http LAN (no secure context → no `navigator.wakeLock`)
 * or leaving the screen before the browser granted the lock — and the rejection surfaced as an
 * uncaught error on navigation. Here a lock is released only if it was actually acquired, exactly
 * once, including when the screen is left while activation is still pending.
 */
export function useKeepScreenAwake(active = true): void {
  useEffect(() => {
    if (!active) return;
    const tag = `hydra-keep-awake-${++nextTag}`;
    let disposed = false;
    let held = false;
    const release = () => {
      if (!held) return;
      held = false;
      deactivateKeepAwake(tag).catch(() => undefined);
    };
    void (async () => {
      try {
        if (!(await isAvailableAsync()) || disposed) return;
        await activateKeepAwakeAsync(tag);
        held = true;
        // The screen was left while the lock was being granted: hand it straight back.
        if (disposed) release();
      } catch {
        // Unsupported (insecure web context, permissions policy, battery saver): the screen may dim.
      }
    })();
    return () => {
      disposed = true;
      release();
    };
  }, [active]);
}
