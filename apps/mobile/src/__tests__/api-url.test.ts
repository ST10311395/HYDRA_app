/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { resolveApiUrl } from '../config';

const dev = { appEnv: 'development', isDevice: true } as const;
const metro = '10.117.231.194:8081';

describe('API URL resolution (local network testing)', () => {
  it('uses EXPO_PUBLIC_API_URL when it is a LAN address', () => {
    expect(resolveApiUrl({ ...dev, platform: 'android', envUrl: 'http://192.168.1.20:4000/', hostUri: metro })).toEqual({ url: 'http://192.168.1.20:4000', source: 'env' });
  });

  it('never sends a physical phone to localhost or the emulator alias — uses the Metro LAN host', () => {
    for (const envUrl of ['http://localhost:4000', 'http://127.0.0.1:4000', 'http://10.0.2.2:4000']) {
      expect(resolveApiUrl({ ...dev, platform: 'ios', envUrl, hostUri: metro }).url).toBe('http://10.117.231.194:4000');
      expect(resolveApiUrl({ ...dev, platform: 'android', envUrl, hostUri: metro }).source).toBe('env-rewritten-for-device');
    }
  });

  it('derives the URL from the Metro host when no env URL is set', () => {
    expect(resolveApiUrl({ ...dev, platform: 'android', hostUri: metro })).toEqual({ url: 'http://10.117.231.194:4000', source: 'metro-host' });
  });

  it('keeps emulator/simulator defaults when nothing better is known', () => {
    expect(resolveApiUrl({ ...dev, isDevice: false, platform: 'android' }).url).toBe('http://10.0.2.2:4000');
    expect(resolveApiUrl({ ...dev, isDevice: false, platform: 'ios', envUrl: 'http://localhost:4000', hostUri: metro }).url).toBe('http://localhost:4000');
  });

  it('web uses the env URL, or the host the page was opened on', () => {
    expect(resolveApiUrl({ ...dev, platform: 'web', envUrl: 'http://10.117.231.194:4000' }).url).toBe('http://10.117.231.194:4000');
    expect(resolveApiUrl({ ...dev, platform: 'web', webHost: 'localhost' }).url).toBe('http://localhost:4000');
    expect(resolveApiUrl({ ...dev, platform: 'web', webHost: '10.117.231.194' }).url).toBe('http://10.117.231.194:4000');
  });

  it('ignores tunnel hostnames (the API is not exposed through the Expo tunnel)', () => {
    expect(resolveApiUrl({ ...dev, isDevice: false, platform: 'android', hostUri: 'abc-anonymous-8081.exp.direct' }).source).toBe('fallback');
  });

  it('production requires https', () => {
    expect(() => resolveApiUrl({ ...dev, appEnv: 'production', platform: 'ios', envUrl: 'http://10.0.0.1:4000' })).toThrow(/https/);
    expect(() => resolveApiUrl({ ...dev, appEnv: 'production', platform: 'ios' })).toThrow(/https/);
    expect(resolveApiUrl({ ...dev, appEnv: 'production', platform: 'ios', envUrl: 'https://api.psg.example' }).url).toBe('https://api.psg.example');
  });
});
