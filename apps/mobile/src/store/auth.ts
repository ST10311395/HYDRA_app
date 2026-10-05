/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AuthSession, AuthUser } from '@hydra/shared';
import { create } from 'zustand';
import { apiRequest, configureAuthBridge } from '../api/client';
import { unregisterPush } from '../features/pushRegistration';
import type { SessionStatus } from '../navigation/guards';

export { homeForRole } from '../navigation/guards';

/**
 * Session state. The access token lives only in memory; the rotating refresh token is stored in
 * the OS keystore (iOS Keychain / Android Keystore via SecureStore) — never AsyncStorage (spec §6.3).
 */
const REFRESH_KEY = 'hydra.refreshToken';
/** Non-sensitive UI preference: the visitor chose "Continue as guest" on the welcome screen. */
const GUEST_KEY = 'hydra.guest-mode';

interface AuthState {
  status: SessionStatus;
  user: AuthUser | null;
  accessToken: string | null;
  /** Signed-out visitor who chose to browse the public site; skips the welcome gateway on launch. */
  guest: boolean;
  setSession: (s: AuthSession) => Promise<void>;
  setUser: (u: AuthUser) => void;
  bootstrap: () => Promise<void>;
  continueAsGuest: () => void;
  signOut: (opts?: { remote?: boolean }) => Promise<void>;
}

function saveGuest(on: boolean): void {
  void (on ? AsyncStorage.setItem(GUEST_KEY, '1') : AsyncStorage.removeItem(GUEST_KEY)).catch(() => undefined);
}

async function readGuest(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUEST_KEY)) === '1';
  } catch {
    return false;
  }
}

async function saveRefresh(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    // SecureStore unavailable (web preview): session stays in memory only.
  }
}

async function readRefresh(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
export const onSignOut = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  guest: false,
  setSession: async (s) => {
    await saveRefresh(s.refreshToken);
    saveGuest(false);
    // The role always comes from the server's session response — never from client navigation.
    set({ status: 'signedIn', user: s.user, accessToken: s.accessToken, guest: false });
  },
  setUser: (u) => set({ user: u }),
  bootstrap: async () => {
    const [session, guest] = await Promise.all([refreshSession(), readGuest()]);
    if (!session) set({ status: 'signedOut', user: null, accessToken: null, guest });
  },
  continueAsGuest: () => {
    saveGuest(true);
    set({ guest: true });
  },
  signOut: async ({ remote = true } = {}) => {
    const refreshToken = await readRefresh();
    if (remote && get().accessToken) {
      // Stop this device receiving the signed-out user's notifications, then revoke the session.
      await unregisterPush();
      await apiRequest('POST', '/auth/logout', { body: { refreshToken: refreshToken ?? undefined } }).catch(() => undefined);
    }
    await saveRefresh(null);
    saveGuest(false);
    // Signing out (or an expired session) returns to the welcome / sign-in gateway.
    set({ status: 'signedOut', user: null, accessToken: null, guest: false });
    listeners.forEach((fn) => fn());
  },
}));

async function refreshSession(): Promise<AuthSession | null> {
  const refreshToken = await readRefresh();
  if (!refreshToken) return null;
  try {
    const s = await apiRequest<AuthSession>('POST', '/auth/refresh', { body: { refreshToken }, auth: false });
    await useAuth.getState().setSession(s);
    return s;
  } catch (e) {
    // Only discard the stored token when the server rejected it; keep it on network failure.
    if ((e as { code?: string }).code !== 'NETWORK') await saveRefresh(null);
    return null;
  }
}

configureAuthBridge({
  getAccessToken: () => useAuth.getState().accessToken,
  refresh: refreshSession,
  onSessionExpired: () => void useAuth.getState().signOut({ remote: false }),
});
