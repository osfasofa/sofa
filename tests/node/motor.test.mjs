// The motor, held to research/00 §6: 0.7 s to speed, a brake that only ever
// slows, a backspin that recovers through zero once, a hand that is obeyed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = await build({
  entryPoints: [path.join(root, 'src/platter/motor.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
  alias: { '@sk': path.join(root, 'vendor/sofakit/src') },
});
const { step, TURNTABLE, REST_EPS } = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
);

const run = (s, secs, dt = 1 / 240) => {
  const trace = [];
  for (let t = 0; t < secs; t += dt) {
    s.omega = step(s, dt, TURNTABLE);
    trace.push(s.omega);
  }
  return trace;
};

test('spin-up: 95 % of target in 0.7 s, and it settles exactly', () => {
  const s = { omega: 0, target: 1, on: true, held: false };
  const tr = run(s, 0.7);
  assert.ok(tr.at(-1) >= 0.949 && tr.at(-1) < 0.96, `at 0.7 s: ${tr.at(-1)}`);
  run(s, 3);
  assert.equal(s.omega, 1);
});

test('brake: never speeds up, never reverses, reaches rest', () => {
  const s = { omega: 1, target: 1, on: false, held: false };
  const tr = run(s, 3);
  for (let i = 1; i < tr.length; i += 1) assert.ok(tr[i] <= tr[i - 1] && tr[i] >= 0, `step ${i}`);
  assert.equal(s.omega, 0);
});

test('backspin with the motor on recovers through zero exactly once', () => {
  const s = { omega: -1.5, target: 1, on: true, held: false };
  const tr = run(s, 3);
  let crossings = 0;
  for (let i = 1; i < tr.length; i += 1) if ((tr[i - 1] < 0) !== (tr[i] < 0)) crossings += 1;
  assert.equal(crossings, 1);
  assert.equal(s.omega, 1);
});

test('a hand on the platter is obeyed: the motor does not move omega while held', () => {
  const s = { omega: 0.3, target: 1, on: true, held: true };
  run(s, 1);
  assert.equal(s.omega, 0.3);
});

test('a big dt is safe: finite, monotone toward target, no overshoot', () => {
  const s = { omega: 0, target: 1, on: true, held: false };
  const w = step(s, 5, TURNTABLE);
  assert.ok(Number.isFinite(w) && w <= 1 && w > 0.99);
  const b = step({ omega: 2, target: 1, on: false, held: false }, 5, TURNTABLE);
  assert.ok(b >= 0 && b < REST_EPS);
});
