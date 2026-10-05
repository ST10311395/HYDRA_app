/*
 * Code Attribution
 * ESLint. 2026. ESLint documentation. Available at: https://eslint.org/docs/latest/ [Accessed 5 September 2026].
 */
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*', 'coverage/*'],
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // Jest setup and test files: jest globals, and jest.mock factories must use require().
    files: ['jest.setup.js', 'src/**/__tests__/**', 'src/test-utils/**'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
]);
