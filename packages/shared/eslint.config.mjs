/*
 * Code Attribution
 * ESLint. 2026. ESLint documentation. Available at: https://eslint.org/docs/latest/ [Accessed 5 September 2026].
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
