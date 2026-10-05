/*
 * Code Attribution
 * Meta Open Source. 2026. Jest documentation. Available at: https://jestjs.io/docs/getting-started [Accessed 9 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|react-native-qrcode-svg|@hydra/shared|@tanstack/.*|@testing-library/.*|standard-navigation))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/__tests__/**', '!src/test-utils/**'],
  testTimeout: 15000,
};
