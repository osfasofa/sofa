// Landing a record: the room on the tape, the words a refusal is made of, and
// the wave the groove draws — the pure parts, headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = await build({
  stdin: {
    contents: ["export { fits, mmss, waveOfBuffer } from './src/deck/land';", "export { BLOCK_FRAMES } from './vendor/sofakit/src/audio/tape-fmt.gen';"].join('\n'),
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
  alias: { '@sk': path.join(root, 'vendor/sofakit/src') },
});
const { fits, mmss, waveOfBuffer, BLOCK_FRAMES } = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
);

const SR = 48000;
const TAPE = 1500 * SR; // the Sofa's profile: twenty-five minutes

test('mmss floors to whole seconds and pads', () => {
  assert.equal(mmss(0, SR), '0:00');
  assert.equal(mmss(7 * 60 * SR + 12 * SR + SR / 2, SR), '7:12');
  assert.equal(mmss(1500 * SR, SR), '25:00');
});

test('a record fits when it leaves the seam block clear', () => {
  assert.deepEqual(fits(7 * 60 * SR, TAPE, SR), { ok: true });
  assert.deepEqual(fits(TAPE - BLOCK_FRAMES, TAPE, SR), { ok: true }, 'exactly the room');
  const over = fits(TAPE - BLOCK_FRAMES + 1, TAPE, SR);
  assert.equal(over.ok, false);
  assert.match(over.why, /^this record runs 24:59; the tape holds 24:59 — cut it shorter first$/);
});

test('a record longer than the tape is refused in words, with both lengths', () => {
  const r = fits(26 * 60 * SR + 40 * SR, TAPE, SR);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'this record runs 26:40; the tape holds 24:59 — cut it shorter first');
});

test('an empty record is refused too', () => {
  for (const bad of [0, -1, NaN]) {
    const r = fits(bad, TAPE, SR);
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.why, 'this record is empty');
  }
});

/** A buffer-shaped object: `chans` arrays of samples. */
const buf = (...chans) => ({
  length: chans[0].length,
  numberOfChannels: chans.length,
  getChannelData: (c) => Float32Array.from(chans[c]),
});

test('the wave is per-bin min and max, mono, normalised to the peak', () => {
  // Four bins over eight samples: [1,-1] [0.5,0.5] [0,0] [-0.25,0.25] on L; R is silent,
  // so the mono mix halves everything and the normalisation puts the peak back at 1.
  const w = waveOfBuffer(buf([1, -1, 0.5, 0.5, 0, 0, -0.25, 0.25], [0, 0, 0, 0, 0, 0, 0, 0]), 4);
  assert.equal(w.min.length, 4);
  assert.equal(w.max.length, 4);
  assert.deepEqual(Array.from(w.max), [1, 0.5, 0, 0.25]);
  assert.deepEqual(Array.from(w.min), [-1, 0.5, 0, -0.25]);
});

test('a silent record draws a flat groove, and a mono one is not doubled', () => {
  const flat = waveOfBuffer(buf(new Array(64).fill(0)), 8);
  assert.ok(Array.from(flat.max).every((v) => v === 0) && Array.from(flat.min).every((v) => v === 0));
  const mono = waveOfBuffer(buf([0.5, -0.5, 0.5, -0.5]), 2);
  assert.deepEqual(Array.from(mono.max), [1, 1]);
  assert.deepEqual(Array.from(mono.min), [-1, -1]);
});
