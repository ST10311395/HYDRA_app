/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as monitor from '../../modules/missed-call-monitor';
import { syncMissedCalls } from '../features/missedCallSync';
import { apiError, mockApi, respond, signInAs } from '../test-utils';

jest.mock('../../modules/missed-call-monitor', () => ({
  isMissedCallMonitorAvailable: jest.fn(() => true),
  hasCallLogPermission: jest.fn(() => true),
  getMissedCallsSince: jest.fn(async () => []),
}));
jest.mock('expo-application', () => ({ getAndroidId: jest.fn(() => 'device-123') }));

const NOW = Date.parse('2026-09-29T10:00:00Z');

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Platform.OS = 'android';
  signInAs('ADMIN_OFFICE');
});

afterAll(() => {
  Platform.OS = 'ios';
});

describe('Android missed-call sync (spec §11)', () => {
  it('refuses to run without the native module or the OS permission', async () => {
    (monitor.isMissedCallMonitorAvailable as jest.Mock).mockReturnValueOnce(false);
    await expect(syncMissedCalls(NOW)).rejects.toThrow(/Android admin build/);
    (monitor.hasCallLogPermission as jest.Mock).mockReturnValueOnce(false);
    await expect(syncMissedCalls(NOW)).rejects.toThrow(/permission/);
    expect(monitor.getMissedCallsSince).not.toHaveBeenCalled();
  });

  it('sends only number, time and ring duration; skips withheld numbers and duplicates', async () => {
    (monitor.getMissedCallsSince as jest.Mock).mockResolvedValueOnce([
      { number: '+27825550101', timestamp: NOW - 60_000, durationSeconds: 12.4 },
      { number: 'PRIVATE', timestamp: NOW - 50_000, durationSeconds: 3 },
      { number: '0115550199', timestamp: NOW - 40_000, durationSeconds: 5 },
    ]);
    const m = mockApi({
      'POST /missed-calls': (c) => ((c.body as { phoneNumber: string }).phoneNumber === '0115550199' ? apiError(409, 'DUPLICATE_MISSED_CALL', 'Already logged') : respond(201, { id: 'mc1' })),
    });
    const r = await syncMissedCalls(NOW);
    expect(r).toEqual({ found: 3, logged: 1, skipped: 2 });
    expect(monitor.getMissedCallsSince).toHaveBeenCalledWith(NOW - 24 * 3_600_000);
    expect(m.calls[0]?.body).toEqual({ phoneNumber: '+27825550101', callAt: new Date(NOW - 60_000).toISOString(), durationSeconds: 12, deviceId: 'device-123', source: 'DEVICE_MONITOR' });
    expect(await AsyncStorage.getItem('hydra.missedCalls.lastSync')).toBe(String(NOW - 40_000 + 1));
  });

  it('pages through full native batches so no call is skipped on a busy phone', async () => {
    const batch = Array.from({ length: 100 }, (_, i) => ({ number: `+2782555${String(1000 + i)}`, timestamp: NOW - 200_000 + i * 1000, durationSeconds: 1 }));
    (monitor.getMissedCallsSince as jest.Mock).mockResolvedValueOnce(batch).mockResolvedValueOnce([{ number: '+27825559999', timestamp: NOW - 1000, durationSeconds: 1 }]);
    mockApi({ 'POST /missed-calls': () => respond(201, { id: 'mc' }) });
    const r = await syncMissedCalls(NOW);
    expect(r).toEqual({ found: 101, logged: 101, skipped: 0 });
    expect((monitor.getMissedCallsSince as jest.Mock).mock.calls[1]?.[0]).toBe(batch[99]!.timestamp + 1);
  });

  it('continues from the last sync point and stops (for retry) on server errors', async () => {
    await AsyncStorage.setItem('hydra.missedCalls.lastSync', String(NOW - 5_000));
    (monitor.getMissedCallsSince as jest.Mock).mockResolvedValueOnce([{ number: '+27825550101', timestamp: NOW - 1_000, durationSeconds: 1 }]);
    mockApi({ 'POST /missed-calls': () => apiError(403, 'FORBIDDEN', 'Missed-call monitoring consent has not been given on this account') });
    await expect(syncMissedCalls(NOW)).rejects.toThrow(/consent/);
    expect(monitor.getMissedCallsSince).toHaveBeenCalledWith(NOW - 5_000);
    expect(await AsyncStorage.getItem('hydra.missedCalls.lastSync')).toBe(String(NOW - 5_000));
  });
});
