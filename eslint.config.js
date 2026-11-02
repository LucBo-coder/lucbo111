// ESLint flat config (npm run lint): the recommended JS + TypeScript rules, tuned to how this codebase is written.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'tiled/**', 'test-results/**', 'playwright-report/**', 'server/data/**'] },
  // the e2e specs carry per-file `no-explicit-any` disables from before the e2e override below
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      // `a() || b()` fallbacks are a deliberate idiom here; control characters in regexes strip unsafe names
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-control-regex': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  // build / data scripts and the game server run on Node
  { files: ['scripts/**', 'server/**', '*.config.*'], languageOptions: { globals: { ...globals.node } } },
  // e2e specs drive the page through untyped `window.__adv` / Phaser objects: `any` is the honest type there
  { files: ['e2e/**', 'tests/**', 'scripts/**'], languageOptions: { globals: { ...globals.node } }, rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
