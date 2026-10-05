import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const API_PORT = 4000;

/** Hosts that only work when the API runs on the same machine/emulator as the app — never on a phone. */
const DEVICE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '10.0.2.2']);
const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export interface ApiUrlInput {
  appEnv: string;
  /** EXPO_PUBLIC_API_URL */
  envUrl?: string;
  platform: string;
  /** Metro's LAN host from Expo (`hostUri`), e.g. "192.168.1.20:8081". */
  hostUri?: string | null;
  /** window.location.hostname on web. */
  webHost?: string;
  /** false on simulators/emulators. */
  isDevice: boolean;
}

export type ApiUrlSource = 'env' | 'env-rewritten-for-device' | 'metro-host' | 'web-host' | 'fallback';

/**
 * Resolves the API base URL. EXPO_PUBLIC_API_URL wins; in development a physical phone is never sent to
 * localhost/10.0.2.2 (those are the phone itself) — the Metro bundler's LAN IP is used instead, because
 * the API runs on the same machine as Metro. Production builds require an https URL (spec §17.1).
 */
export function resolveApiUrl(input: ApiUrlInput): { url: string; source: ApiUrlSource } {
  const envUrl = input.envUrl?.trim().replace(/\/+$/, '') || undefined;
  if (input.appEnv === 'production') {
    if (!envUrl?.startsWith('https://')) {
      throw new Error('Insecure API URL rejected in production build. EXPO_PUBLIC_API_URL must use https://');
    }
    return { url: envUrl, source: 'env' };
  }

  const metroHost = input.hostUri?.split(':')[0];
  const lanHost = metroHost && IPV4.test(metroHost) && !DEVICE_LOCAL_HOSTS.has(metroHost) ? metroHost : undefined;

  if (input.platform === 'web') {
    if (envUrl) return { url: envUrl, source: 'env' };
    return input.webHost ? { url: `http://${input.webHost}:${API_PORT}`, source: 'web-host' } : { url: `http://localhost:${API_PORT}`, source: 'fallback' };
  }

  if (envUrl) {
    let host: string | undefined;
    try {
      host = new URL(envUrl).hostname;
    } catch {
      host = undefined;
    }
    if (input.isDevice && lanHost && host && DEVICE_LOCAL_HOSTS.has(host)) {
      const url = new URL(envUrl);
      url.hostname = lanHost;
      return { url: url.toString().replace(/\/+$/, ''), source: 'env-rewritten-for-device' };
    }
    return { url: envUrl, source: 'env' };
  }
  if (lanHost) return { url: `http://${lanHost}:${API_PORT}`, source: 'metro-host' };
  return { url: input.platform === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`, source: 'fallback' };
}

const resolved = resolveApiUrl({
  appEnv: APP_ENV,
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  platform: Platform.OS,
  hostUri: Constants.expoConfig?.hostUri,
  webHost: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location?.hostname : undefined,
  isDevice: Device.isDevice,
});

if (APP_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  // Shown in the Metro terminal — the first thing to check when a phone cannot reach the API.
  console.info(`[HYDRA] API ${resolved.url} (${resolved.source})`);
}

export const config = {
  appEnv: APP_ENV,
  apiUrl: resolved.url,
  apiUrlSource: resolved.source,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  // Falls back to the project ID baked into app.config.ts so push works without the env var.
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || ((Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? ''),
  isProduction: APP_ENV === 'production',
};
