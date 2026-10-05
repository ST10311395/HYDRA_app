/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { isPushEnabled, registerForPush, setPushEnabled } from '../features/pushRegistration';
import { useAuth } from '../store/auth';
import { mockApi, respond, signInAs } from '../test-utils';

jest.mock('../config', () => ({ config: { apiUrl: 'http://localhost:4000', easProjectId: 'test-project', appEnv: 'test', isProduction: false } }));
jest.mock('expo-device', () => ({ isDevice: true }));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  signInAs('CUSTOMER');
});

describe('push notification registration and preferences', () => {
  it('registers the Expo push token for the signed-in user', async () => {
    const m = mockApi({ 'POST /profile/push-tokens': () => respond(201, { registered: true }) });
    await expect(registerForPush()).resolves.toBe('registered');
    expect(m.find('POST', '/profile/push-tokens')[0]?.body).toEqual({ token: 'ExponentPushToken[test]', platform: 'ios' });
  });

  it('unregisters this device on sign-out so the next user does not get the previous user’s alerts', async () => {
    const m = mockApi({
      'POST /profile/push-tokens': () => respond(201, {}),
      'DELETE /profile/push-tokens': () => respond(200, { removed: true }),
      'POST /auth/logout': () => respond(204),
    });
    await registerForPush();
    await useAuth.getState().signOut();
    expect(m.find('DELETE', '/profile/push-tokens')[0]?.body).toEqual({ token: 'ExponentPushToken[test]' });
    const order = m.calls.map((c) => `${c.method} ${c.path}`);
    expect(order.indexOf('DELETE /profile/push-tokens')).toBeLessThan(order.indexOf('POST /auth/logout'));
  });

  it('turning push off removes the token and is remembered on this device', async () => {
    const m = mockApi({ 'POST /profile/push-tokens': () => respond(201, {}), 'DELETE /profile/push-tokens': () => respond(200, {}) });
    await registerForPush();
    await expect(setPushEnabled(false)).resolves.toBe('disabled');
    expect(m.find('DELETE', '/profile/push-tokens')).toHaveLength(1);
    await expect(isPushEnabled()).resolves.toBe(false);
    await expect(registerForPush()).resolves.toBe('disabled');
    expect(m.find('POST', '/profile/push-tokens')).toHaveLength(1);
  });

  it('respects an OS-level denial without calling the API', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const m = mockApi({});
    await expect(registerForPush()).resolves.toBe('denied');
    expect(m.calls).toHaveLength(0);
  });
});
