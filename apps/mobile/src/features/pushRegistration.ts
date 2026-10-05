/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { config } from '../config';

const PREF_KEY = 'hydra.push.enabled';
let registeredToken: string | null = null;

/** Device-level preference (spec §5.2 “manage notification preferences”). Defaults to on. */
export async function isPushEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREF_KEY)) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Requests permission (only after sign-in) and registers this device's Expo push token for the
 * signed-in user. No device identifiers other than the push token are sent.
 */
export async function registerForPush(): Promise<'registered' | 'disabled' | 'denied' | 'unavailable'> {
  if (!(await isPushEnabled())) return 'disabled';
  if (!Device.isDevice || Platform.OS === 'web' || !config.easProjectId) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Job updates', importance: Notifications.AndroidImportance.HIGH, lightColor: '#2F6BFF' });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const token = await Notifications.getExpoPushTokenAsync({ projectId: config.easProjectId });
  await api.post('/profile/push-tokens', { token: token.data, platform: Platform.OS });
  registeredToken = token.data;
  return 'registered';
}

/** Removes this device's token for the current user — on sign-out and when push is switched off. */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (token) await api.delete('/profile/push-tokens', { token }).catch(() => undefined);
}

export async function setPushEnabled(enabled: boolean): Promise<'registered' | 'disabled' | 'denied' | 'unavailable'> {
  try {
    await AsyncStorage.setItem(PREF_KEY, String(enabled));
  } catch {
    // Preference storage unavailable — still apply the change for this session.
  }
  if (!enabled) {
    await unregisterPush();
    return 'disabled';
  }
  return registerForPush();
}
