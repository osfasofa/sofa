import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { audioWorklet, dspWasmPath, wasmHmr } from './vite/sofakit-plugins';

// Phone testing on the LAN: crossOriginIsolated and getUserMedia both require a
// secure context. Point SK_TLS_CERT / SK_TLS_KEY at a (self-signed) cert:
//   SK_TLS_CERT=… SK_TLS_KEY=… npm run preview -- --host
const tls =
  process.env.SK_TLS_CERT !== undefined && process.env.SK_TLS_KEY !== undefined
    ? { cert: fs.readFileSync(process.env.SK_TLS_CERT), key: fs.readFileSync(process.env.SK_TLS_KEY) }
    : undefined;

// Cross-origin isolation, or there is no SharedArrayBuffer and the deck cannot
// boot. `require-corp`, not `credentialless`: iOS Safari knows only the former
// (found on the first phone, 2026-08-29). Shared takes come from a blob host
// on another origin, fetched in CORS mode, which require-corp permits.
const COI = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Document-Isolation-Policy': 'isolate-and-require-corp',
};

export default defineConfig({
  plugins: [dspWasmPath(), audioWorklet(), wasmHmr()],
  resolve: { alias: { '@sk': path.resolve('vendor/sofakit/src') } },
  worker: {
    format: 'es',
    // The worker sub-build has its own plugin pipeline: without this,
    // tape.worker's `@sk-dsp-wasm?url` import fails to resolve in production.
    plugins: () => [dspWasmPath()],
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { headers: COI, https: tls },
  preview: { headers: COI, https: tls },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // never base64-inline .wasm
    sourcemap: false, // sourcemaps carry source comments that name the sibling products
  },
  assetsInclude: ['**/*.wasm'],
});
