import js from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import heavyEffects from './eslint-rules/no-heavy-effects.mjs';

// Formatting is owned by Prettier (`prettier --check .` in CI), so
// `eslint-config-prettier` is spread last to disable conflicting rules.
//
// Deliberately absent:
// - `eslint-plugin-react`: no release supports ESLint 10 (`peerDependencies`
//   stops at ^9.7) and its rules crash. Re-add when it supports v10.
// - type-aware linting (typescript-eslint): v8 refuses to load against the
//   installed TypeScript 7 (peer range `<6.1.0`). Revisit once it supports TS >= 7.1.
export default [
  {
    ignores: [
      'node_modules/',
      '.next/',
      'dist/',
      'playwright-report/',
      'coverage/',
      'scripts/',
      'eslint-rules/',
      '.agents/',
      // Hand-written service worker: global function declarations are required
      // by the SW scope, so `no-implicit-globals` / `array-callback-return` false-positive.
      'public/sw.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
      local: heavyEffects,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: babelParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        requireConfigFile: false,
        babelOptions: {
          presets: [['@babel/preset-react', { runtime: 'automatic' }], '@babel/preset-typescript'],
        },
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'local/no-heavy-effects': 'error',

      // Ported from the retired .eslintrc.json (rules that are real and
      // additive over `js.configs.recommended`).
      // `no-alert` is intentionally omitted: the admin consultation views use
      // `confirm`/`prompt` deliberately; replacing them is separate UX work.
      eqeqeq: ['error', 'smart'],
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'properties'],
      'array-callback-return': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-implicit-globals': 'error',
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  prettierConfig,
];
