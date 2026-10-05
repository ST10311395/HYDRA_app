/*
 * Code Attribution
 * ESLint. 2026. ESLint documentation. Available at: https://eslint.org/docs/latest/ [Accessed 5 September 2026].
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'uploads/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**', 'seeds/**', 'src/db/migrate.ts', 'src/db/createOwner.ts', 'src/jobs/worker.ts'],
    rules: { 'no-console': 'off' },
  },
);
