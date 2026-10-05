/**
 * Jest environment for the HYDRA mobile app (jest-expo preset). Native modules that have no JS
 * implementation under Node are replaced with small, deterministic in-memory fakes.
 */

// Keychain/Keystore — an in-memory map so tests can assert what was (and was not) stored.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -26.1076, longitude: 28.0567, accuracy: 8 } })),
  getLastKnownPositionAsync: jest.fn(async () => null),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ on: jest.fn(), off: jest.fn(), emit: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), connected: false })),
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props) => require('react').createElement(View, { testID: props.testID, accessibilityLabel: props.accessibilityLabel }) };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn(async () => true), signIn: jest.fn(), signOut: jest.fn(async () => undefined) },
  isSuccessResponse: jest.fn(() => false),
  isErrorWithCode: jest.fn(() => false),
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS', PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE' },
}));

// Expo Router: a controllable navigation fake. Tests set params via `__setParams` and assert on `router`.
jest.mock('expo-router', () => {
  const React = require('react');
  let params = {};
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
  };
  const Passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
  const Stack = Object.assign(Passthrough, { Screen: () => null, Protected: Passthrough });
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => params,
    useGlobalSearchParams: () => params,
    useSegments: () => [],
    usePathname: () => '/',
    useFocusEffect: jest.fn(),
    useIsFocused: () => true,
    Link: ({ children }) => React.createElement(React.Fragment, null, children),
    Redirect: () => null,
    Stack,
    Tabs: Stack,
    DarkTheme: { colors: {} },
    ThemeProvider: Passthrough,
    __setParams: (p) => {
      params = p;
    },
  };
});

beforeEach(() => {
  require('expo-secure-store').__store.clear();
  require('expo-router').__setParams?.({}); // absent when a suite uses the real router
});
