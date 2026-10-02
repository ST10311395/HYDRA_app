import { Platform } from 'react-native';
import { config } from '../config';

/**
 * Google Sign-In via @react-native-google-signin (native, requires a development/production build —
 * not Expo Go). Returns a Google ID token which the HYDRA API verifies server-side; the Google token
 * is never used as the HYDRA session.
 */
export type GoogleResult = { ok: true; idToken: string } | { ok: false; reason: 'cancelled' | 'unavailable' | 'not_configured' | 'error'; message: string };

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let mod: GoogleModule | null | undefined;
let configured = false;

function load(): GoogleModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    mod = null;
  }
  return mod;
}

export type GoogleSignInStatus = 'ready' | 'not_configured' | 'unavailable';

/** `not_configured`: no OAuth client ID in this build. `unavailable`: web / Expo Go (needs the native module). */
export function googleSignInStatus(): GoogleSignInStatus {
  if (!config.googleWebClientId) return 'not_configured';
  if (Platform.OS === 'web' || load() === null) return 'unavailable';
  return 'ready';
}

export function googleSignInAvailable(): boolean {
  return googleSignInStatus() === 'ready';
}

/** User-facing explanation for a disabled Google button, or null when it can be used. */
export function googleSignInNotice(): string | null {
  switch (googleSignInStatus()) {
    case 'not_configured':
      return config.isProduction
        ? 'Google Sign-In is not available in this version of the app.'
        : 'Google Sign-In is not configured for this build (no EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID). Use email and password — see docs/GOOGLE_AUTH.md.';
    case 'unavailable':
      return 'Google Sign-In works in the installed PSG Electrical app only (not in the browser or Expo Go).';
    default:
      return null;
  }
}

export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!config.googleWebClientId) return { ok: false, reason: 'not_configured', message: 'Google Sign-In is not configured for this build.' };
  const g = Platform.OS === 'web' ? null : load();
  if (!g) return { ok: false, reason: 'unavailable', message: 'Google Sign-In requires the installed PSG Electrical app (not available in this preview).' };
  const { GoogleSignin, isErrorWithCode, statusCodes } = g;
  try {
    if (!configured) {
      GoogleSignin.configure({ webClientId: config.googleWebClientId, iosClientId: config.googleIosClientId || undefined, scopes: ['email', 'profile'], offlineAccess: false });
      configured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') return { ok: false, reason: 'cancelled', message: 'Sign-in cancelled' };
    const idToken = res.data.idToken;
    if (!idToken) return { ok: false, reason: 'error', message: 'Google did not return an identity token.' };
    // Sign out of the Google SDK session: HYDRA maintains its own session from here.
    await GoogleSignin.signOut().catch(() => undefined);
    return { ok: true, idToken };
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return { ok: false, reason: 'cancelled', message: 'Sign-in already in progress' };
    if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { ok: false, reason: 'unavailable', message: 'Google Play Services is not available on this device.' };
    return { ok: false, reason: 'error', message: 'Google sign-in failed. Please try again.' };
  }
}
