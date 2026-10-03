import * as Location from 'expo-location';
import { Platform } from 'react-native';

/** Parses the customer's QR payload `HYDRA1:<jobId>:<token>` (the token itself is opaque). */
export function parseHydraQr(data: string): { jobId: string; payload: string } | null {
  const m = /^HYDRA1:([0-9a-f-]{36}):([A-Za-z0-9_-]{20,})$/i.exec(data.trim());
  return m ? { jobId: m[1]!.toLowerCase(), payload: data.trim() } : null;
}

export type GpsResult = { ok: true; latitude: number; longitude: number; accuracy?: number } | { ok: false; reason: 'denied' | 'unavailable'; message: string };

/**
 * Location is requested only at the moment of confirming arrival (spec §9.4 / PDF privacy): foreground
 * permission only, a single fix, no background tracking.
 */
export async function captureArrivalLocation(): Promise<GpsResult> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'denied', message: 'Location permission is required to confirm arrival on site.' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 20_000);
      }),
    ]);
    clearTimeout(timer);
    return { ok: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
  } catch {
    clearTimeout(timer);
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
    if (last) return { ok: true, latitude: last.coords.latitude, longitude: last.coords.longitude, accuracy: last.coords.accuracy ?? undefined };
    return { ok: false, reason: 'unavailable', message: 'Could not get a GPS fix. Move outdoors or enable location services and try again.' };
  }
}

export type CameraSupport = 'ok' | 'insecure' | 'unsupported';

/**
 * Whether this platform can open a camera at all. Native apps always can (permission permitting).
 * Browsers expose `getUserMedia` only in a secure context, so a phone opening the dev site over
 * plain-http LAN has no camera API; that is reported instead of rendering a black viewfinder.
 */
export function cameraSupport(env: { os?: string; isSecureContext?: boolean; hasGetUserMedia?: boolean } = {}): CameraSupport {
  const os = env.os ?? Platform.OS;
  if (os !== 'web') return 'ok';
  const g = globalThis as { isSecureContext?: boolean; navigator?: { mediaDevices?: { getUserMedia?: unknown } } };
  const secure = env.isSecureContext ?? g.isSecureContext ?? false;
  const gum = env.hasGetUserMedia ?? typeof g.navigator?.mediaDevices?.getUserMedia === 'function';
  if (!secure) return 'insecure';
  return gum ? 'ok' : 'unsupported';
}

export interface CheckinProblem {
  title: string;
  message: string;
  hint?: string;
  /** Rescanning cannot help (e.g. already checked in) — offer the job instead of "Try again". */
  final?: boolean;
}

/** Plain-language outcome for each server/network failure of a QR check-in. Never reports success. */
export function describeCheckinError(code: string | undefined, message: string): CheckinProblem {
  switch (code) {
    case 'QR_INVALID':
      return { title: 'QR code not recognised', message, hint: 'Ask the customer to open the job’s Arrival QR and tap “Refresh code now”.' };
    case 'QR_EXPIRED':
      return { title: 'QR code expired', message, hint: 'Ask the customer to tap “Refresh code now”, then scan again.' };
    case 'QR_JOB_MISMATCH':
      return { title: 'Code is for a different job', message, hint: 'Check the job reference on the customer’s screen.' };
    case 'NOT_FOUND':
    case 'FORBIDDEN':
      return { title: 'Not your assigned job', message: 'This job is not assigned to you, so you cannot check in to it.', hint: 'Contact the office if you were sent to this site.' };
    case 'ALREADY_CHECKED_IN':
    case 'QR_ALREADY_USED':
      return { title: 'Already checked in', message, final: true };
    case 'NETWORK':
      return { title: 'No connection', message, hint: 'Nothing was recorded. Check your signal and scan again.' };
    default:
      return { title: 'Check-in not completed', message };
  }
}
