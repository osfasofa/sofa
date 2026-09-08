// The tonearm and the camera, held to numbers: the head sits where the arm's
// arc meets the groove; the record's angle puts that groove under it; the
// camera only turns the picture; a dropped head lands on the groove; the
// spring takes a jump and comes back, a little past.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = await build({
  entryPoints: [path.join(root, 'src/platter/arm.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
  logLevel: 'silent',
});
const { DEFAULT_PIVOT, PIVOT_D_MIN, PIVOT_XY_MAX, armLength, clampPivot, headAngle, headPoint, recordAngle, cameraAngle, cameraFit, nearestOnSpiral, Spring } = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
);

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);
const GROOVE_OUT = 0.98;
const GROOVE_IN = 0.36;
/** The plain spiral's radius ↔ position maps, as the platter lays them out. */
const radial = (u) => GROOVE_OUT + (GROOVE_IN - GROOVE_OUT) * u;
const radialInv = (rad) => (rad - GROOVE_OUT) / (GROOVE_IN - GROOVE_OUT);

test('the default pivot sits off the disc and on the canvas', () => {
  const p = DEFAULT_PIVOT;
  assert.ok(p.d >= PIVOT_D_MIN);
  assert.ok(Math.abs(Math.cos(p.a) * p.d) <= PIVOT_XY_MAX && Math.abs(Math.sin(p.a) * p.d) <= PIVOT_XY_MAX);
  assert.deepEqual(clampPivot(p), p);
});

test('the head is on the arm and on the groove, for every radius of the band', () => {
  const p = DEFAULT_PIVOT;
  const L = armLength(p);
  const px = Math.cos(p.a) * p.d;
  const py = Math.sin(p.a) * p.d;
  for (let rad = GROOVE_IN; rad <= GROOVE_OUT + 1e-9; rad += 0.05) {
    const [hx, hy] = headPoint(p, rad);
    near(Math.hypot(hx, hy), rad, 1e-9, 'on the groove circle');
    near(Math.hypot(hx - px, hy - py), L, 1e-9, 'at the arm\'s length');
  }
  // A real arm's sweep is shallow: rim to label is a few tens of degrees.
  const sweep = Math.abs(headAngle(p, GROOVE_OUT) - headAngle(p, GROOVE_IN));
  assert.ok(sweep > 0.1 && sweep < 1, String(sweep));
});

test("the record's angle puts the groove point under the head, either hand", () => {
  const p = DEFAULT_PIVOT;
  for (const hand of [1, -1]) {
    for (const u of [0, 0.25, 0.5, 0.999]) {
      const turns = 7;
      const rad = radial(u);
      const th = headAngle(p, rad);
      const rec = recordAngle(th, u, turns, hand);
      // The spiral point in the record's frame, turned by rec, is the head.
      const a = hand * u * turns * 2 * Math.PI;
      const sx = Math.cos(a) * rad;
      const sy = Math.sin(a) * rad;
      const x = sx * Math.cos(rec) - sy * Math.sin(rec);
      const y = sx * Math.sin(rec) + sy * Math.cos(rec);
      const [hx, hy] = headPoint(p, rad);
      near(x, hx, 1e-9, `hand ${hand} u ${u}`);
      near(y, hy, 1e-9);
    }
  }
});

test('the camera: still leaves the record turning; riding holds it still and pulls back', () => {
  for (const rec of [0, 1, 4, -2.5]) {
    assert.equal(cameraAngle(rec, 0), 0);
    near(cameraAngle(rec, 1) + rec, 0, 1e-12, 'the record on screen does not move');
    near(cameraAngle(rec, 0.5) + rec, rec / 2, 1e-12, 'half way: half the turn');
  }
  assert.equal(cameraFit(DEFAULT_PIVOT, 0), 1);
  const full = cameraFit(DEFAULT_PIVOT, 1);
  assert.ok(full < 1 && DEFAULT_PIVOT.d * full < 1, 'the pivot\'s whole orbit fits');
  near(cameraFit(DEFAULT_PIVOT, 0.5), full, 1e-12, 'settled by a third of the way');
});

test('a pivot dragged onto the disc or off the canvas is put back', () => {
  const on = clampPivot({ a: 0.3, d: 0.5 });
  assert.ok(on.d >= PIVOT_D_MIN - 1e-9);
  const off = clampPivot({ a: 0.1, d: 3 });
  assert.ok(Math.abs(Math.cos(off.a) * off.d) <= PIVOT_XY_MAX + 1e-9 && Math.abs(Math.sin(off.a) * off.d) <= PIVOT_XY_MAX + 1e-9);
  assert.ok(off.d >= PIVOT_D_MIN - 1e-9);
});

test('a head set down lands on the groove: the turn at that radius, along it to the hand', () => {
  const turns = 6;
  for (const hand of [1, -1]) {
    for (const u of [0.1, 0.37, 0.5, 0.83]) {
      const a = hand * u * turns * 2 * Math.PI;
      const rad = radial(u);
      // Exactly on the groove: found exactly.
      near(nearestOnSpiral(Math.cos(a) * rad, Math.sin(a) * rad, turns, hand, radialInv), u, 1e-9, `hand ${hand} u ${u}`);
      // A little off the groove radially: the same point.
      const rad2 = rad + 0.01;
      near(nearestOnSpiral(Math.cos(a) * rad2, Math.sin(a) * rad2, turns, hand, radialInv), u, 0.02);
    }
  }
  // Off the ends it clamps.
  assert.equal(nearestOnSpiral(1.3, 0, turns, 1, radialInv), 0);
  assert.equal(nearestOnSpiral(0.1, 0, turns, 1, radialInv), 1);
});

test('the spring takes a jump and springs back, a touch past, then rests', () => {
  const s = new Spring();
  s.kick(-3);
  near(s.x, -3, 1e-12, 'the picture holds where it was');
  let overshoot = 0;
  let t = 0;
  for (; t < 2; t += 1 / 60) {
    s.step(1 / 60);
    overshoot = Math.max(overshoot, s.x);
  }
  assert.ok(overshoot > 0.02 && overshoot < 0.6, `a hard spring overshoots a touch: ${overshoot}`);
  assert.ok(s.settled, 'and settles');
  assert.equal(s.x, 0);
  // A long frame does not blow it up.
  s.kick(5);
  s.step(0.5);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 5);
});
