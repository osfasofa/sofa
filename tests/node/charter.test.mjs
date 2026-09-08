// The Sofa's registry test (CHARTER.md §4). Parameterised by charter.json — the
// charter is data — and exactly as hard as the platform's own instrument
// tests: a violation is a failing build that names the offender.
//
//   1. Import jurisdiction: the entry points bundle only from allowedImports,
//      never from forbiddenImports. "No graph" is enforced structurally.
//   2. Shipped strings: every string literal in the minified bundles, plus the
//      page and the manifest, is scanned for the forbidden terms (sibling
//      products, synthesis vocabulary, TE marks, real people and labels).
//   3. Surface grammar: one platter, no crossfader, no record button.
//   4. The brand: whatever the page calls itself is not a sibling's name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const charter = JSON.parse(readFileSync(path.join(root, 'charter.json'), 'utf8'));

const bundles = await build({
  entryPoints: charter.entryPoints.map((e) => path.join(root, e)),
  bundle: true,
  write: false,
  minify: true, // comments gone: we scan what ships, not what the sources say
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  metafile: true,
  logLevel: 'silent',
  absWorkingDir: root,
  outdir: 'charter-scan', // never written: write:false; needed for multi-entry
  alias: { '@sk': path.join(root, 'vendor/sofakit/src') },
  // The vite-specific import forms; their targets are covered as entry points
  // or assets of their own. npm packages are scanned by their own authors.
  external: ['@sk-dsp-wasm?url', '*?worker', '*?audioworklet', 'spools', 'yjs', 'y-protocols', '@vercel/blob/client'],
});

test('charter: declares the deck pillar only — no graph', () => {
  assert.equal(charter.pillars.deck, true);
  assert.equal(charter.pillars.graph, false);
  for (const r of ['graph', 'cables', 'synthesis', 'time-stretch', 'a second turntable']) assert.ok(charter.refusals.includes(r), r);
});

test('imports: every bundled file is inside the charter jurisdiction', () => {
  const inputs = Object.keys(bundles.metafile.inputs);
  assert.ok(inputs.length > 5, 'bundle metafile looks empty');
  for (const input of inputs) {
    const rel = input.replace(/\\/g, '/');
    if (rel.startsWith('(') || rel.includes('?') || rel.startsWith('node_modules/')) continue;
    for (const forbidden of charter.forbiddenImports) {
      assert.ok(!rel.startsWith(forbidden) && !rel.endsWith(forbidden), `the Sofa bundles a forbidden module: ${rel} (charter forbids ${forbidden})`);
    }
    const allowed =
      charter.allowedImports.some((p) => rel.startsWith(p)) || charter.entryPoints.some((e) => rel === e);
    assert.ok(allowed, `the Sofa bundles ${rel}, outside the charter's allowed imports`);
  }
});

/** Extract string literals from minified JS — the user-visible surface of a bundle. */
function literals(js) {
  const re = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  return js.match(re) ?? [];
}

function termMatcher(term) {
  // TE-mark-style short terms get word boundaries; the rest are substrings.
  if (/^(op|tp)-?\d$/.test(term)) {
    const re = new RegExp(`\\b${term.replace('-', '-?')}\\b`, 'i');
    return (s) => re.test(s);
  }
  return (s) => s.toLowerCase().includes(term);
}

const matchers = charter.forbiddenShippedTerms.map((t) => [t, termMatcher(t)]);

test('shipped strings: no forbidden term in any bundle literal', () => {
  for (const out of bundles.outputFiles) {
    for (const lit of literals(out.text)) {
      for (const [term, hit] of matchers) {
        assert.ok(!hit(lit), `forbidden term "${term}" ships in ${path.basename(out.path)}: ${lit.slice(0, 120)}`);
      }
    }
  }
});

test('shipped strings: no forbidden term in the page or manifest', () => {
  for (const file of charter.shippedPages) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const [term, hit] of matchers) {
      assert.ok(!hit(text), `forbidden term "${term}" appears in ${file}`);
    }
  }
});

test('surface grammar: one platter, no crossfader, no record button', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const count = (role) => (html.match(new RegExp(`data-role="${role}"`, 'g')) ?? []).length;
  assert.equal(count('platter'), charter.surface.platters, 'platters');
  assert.equal(count('crossfader'), charter.surface.crossfaders, 'crossfaders');
  assert.equal(count('record'), charter.surface.recordButtons, 'record buttons');
});

test('the brand is not a sibling\'s name', async () => {
  const out = await build({
    entryPoints: [path.join(root, 'src/brand.ts')],
    bundle: true, write: false, format: 'esm', target: 'es2022', logLevel: 'silent',
  });
  const { BRAND } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  assert.equal(typeof BRAND, 'string');
  assert.equal(BRAND, charter.brand, 'src/brand.ts and charter.json disagree on the name');
  const b = BRAND.toLowerCase();
  for (const no of charter.brandMustNotBe) assert.ok(!b.includes(no), `the brand "${BRAND}" wears a sibling's name: ${no}`);
});
