// Two vite plugins copied from the platform's `vite.config.ts` (vendor/sofakit
// at the SHA recorded in VENDOR.md). Copied rather than imported: the upstream
// config default-exports a six-page instrument build with its own React
// plugin, and only these two functions are the build-system contract the deck
// substrate relies on —
//
//   `@sk-dsp-wasm?url`           -> the sk_dsp.wasm artifact URL
//   `./engine.worklet?audioworklet` -> a fully bundled, import-free ES module
//
// Keep them behaviour-identical to upstream; if either changes there, the
// submodule bump that brings it in is the moment to re-copy.
import { build as esbuild } from 'esbuild';
import path from 'node:path';
import type { Plugin } from 'vite';

/** The wasm artifact vite serves and bundles. Dev and tests use the dev-fast
 * profile straight out of the submodule's target/; `just build` points
 * SK_DSP_WASM at the wasm-opt output. */
export const DSP_WASM = path.resolve(
  process.env.SK_DSP_WASM ?? 'vendor/sofakit/target/wasm32-unknown-unknown/dev-fast/sk_dsp.wasm',
);

/** Resolves `@sk-dsp-wasm?url` (an alias cannot carry the query). */
export function dspWasmPath(): Plugin {
  return {
    name: 'sofakit:dsp-wasm-path',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@sk-dsp-wasm?url') return `${DSP_WASM}?url`;
      return null;
    },
  };
}

/**
 * `import url from './engine.worklet?audioworklet'`
 *   -> a URL for a fully-bundled, import-free ES module.
 * Identical behaviour in dev (blob:) and build (emitted asset). Upstream
 * rejected `?worker&url` because in dev it is served through the module graph
 * (any transitive import breaks the worklet) and `?worker` injects worker
 * scaffolding that has no business in an AudioWorkletGlobalScope.
 */
export function audioWorklet(): Plugin {
  const SUF = '?audioworklet';
  let isBuild = false;
  return {
    name: 'sofakit:audio-worklet',
    enforce: 'pre',
    configResolved(c) {
      isBuild = c.command === 'build';
    },
    async resolveId(id, importer) {
      if (!id.endsWith(SUF)) return null;
      const r = await this.resolve(id.slice(0, -SUF.length), importer, { skipSelf: true });
      return r ? r.id + SUF : null;
    },
    async load(id) {
      if (!id.endsWith(SUF)) return null;
      const file = id.slice(0, -SUF.length);
      this.addWatchFile(file);
      const out = await esbuild({
        entryPoints: [file],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
        minify: isBuild,
        sourcemap: isBuild ? false : 'inline',
      });
      const first = out.outputFiles[0];
      if (first === undefined) throw new Error(`audioworklet: esbuild emitted nothing for ${file}`);
      const code = first.text;
      if (isBuild) {
        const ref = this.emitFile({
          type: 'asset',
          name: path.basename(file).replace(/\.(ts|js)$/, '.js'),
          source: code,
        });
        return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
      }
      return `const src = ${JSON.stringify(code)};
export default URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));`;
    },
  };
}

/** Fire an HMR event when cargo rewrites the wasm (the platform's dev loop 4). */
export function wasmHmr(): Plugin {
  return {
    name: 'sofakit:wasm-hmr',
    configureServer(server) {
      server.watcher.add(DSP_WASM);
      const fire = (f: string): void => {
        if (path.resolve(f) === DSP_WASM) server.ws.send({ type: 'custom', event: 'sofakit:dsp' });
      };
      server.watcher.on('change', fire);
      server.watcher.on('add', fire);
    },
  };
}
