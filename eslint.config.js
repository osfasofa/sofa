// The Sofa lints its own code only. The vendored deck substrate (vendor/sofakit)
// is linted upstream under its own rules — including the audio-thread bans on
// the worklet file — and is pinned by SHA, so re-linting it here would only
// tell us what its own CI already said. The needle has its own config.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'vendor/', 'node_modules/', '.vercel/', 'needle/'] },
  ...tseslint.configs.recommended,
  {
    files: ['tests/node/**/*.mjs', 'tests/browser/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', globalThis: 'readonly', __sofa: 'readonly', crossOriginIsolated: 'readonly' },
    },
  },
);
