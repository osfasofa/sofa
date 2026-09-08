// S0 — the skeleton: the turntable boots isolated on a twenty-five-minute
// tape, a dropped file lands in milliseconds and plays, the platter's hand
// drives the deck (a fling backwards runs the tape backwards), and a record
// longer than the tape is refused in words with the one on it untouched.
// Run against `just dev`.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGE = process.env.SK_URL ?? 'http://127.0.0.1:5173/';
const headless = process.env.SK_HEADLESS === '1';
const dir = mkdtempSync(join(tmpdir(), 'sofa-s0-'));
const wav = join(dir, 'tone.wav');
execFileSync(process.execPath, [new URL('../../scripts/tone.mjs', import.meta.url).pathname, wav, '6']);

const ctx = await chromium.launchPersistentContext(join(dir, 'profile'), {
  ...(headless ? {} : { channel: 'chrome' }),
  ...(process.env.SK_CHROMIUM ? { executablePath: process.env.SK_CHROMIUM } : {}),
  headless,
  viewport: { width: 900, height: 1000 },
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run'],
});
const page = await ctx.newPage();
let pageErrors = 0;
page.on('pageerror', (e) => { pageErrors += 1; console.log('PAGEERROR', e.message); });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};
const ev = (fn, arg) => page.evaluate(fn, arg);

const t0 = Date.now();
await page.goto(PAGE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => typeof __sofa !== 'undefined', null, { timeout: 15000 });
const boot = await ev(async () => {
  const ready = await __sofa.ready();
  const d = __sofa.deck();
  return { ready, iso: crossOriginIsolated, err: __sofa.bootError(), lengthFrames: d?.tape.lengthFrames, sr: d?.tape.sampleRate, title: document.title };
});
check('boots isolated, no boot error', boot.ready && boot.iso && boot.err === null, `${Date.now() - t0} ms, ${String(boot.err)}`);
check('on a twenty-five-minute tape at the context rate', boot.lengthFrames === 1500 * boot.sr, `${boot.lengthFrames} frames at ${boot.sr} Hz`);
check('the page wears the brand', boot.title === 'SOFA', boot.title);

// 1 — drop a record: it lands in milliseconds and plays.
await page.setInputFiles('#turntable input.file', wav);
const landed = await page.waitForFunction(() => __sofa.loaded() !== null, null, { timeout: 15000 }).then(() => true).catch(() => false);
const rec = await ev(() => ({ loaded: __sofa.loaded(), err: document.getElementById('err').textContent }));
check('a dropped file lands as the record', landed && rec.loaded?.name === 'tone' && rec.loaded.frames === 6 * boot.sr, JSON.stringify(rec));
await sleep(1200);
const rolling = await ev(() => __sofa.head());
check('…and plays at its own speed', rolling.rolling && rolling.speed > 0.9 && rolling.secs > 0.5, JSON.stringify(rolling));

// 2 — the hand: a fling backwards runs the tape backwards; at rest the motor
// takes it home.
await ev(() => { __sofa.platter().motor(false); __sofa.platter().fling(-2); });
await sleep(250);
const back = await ev(() => __sofa.head());
check('a backspin runs the tape backwards', back.rolling && back.speed < -0.5, JSON.stringify(back));
await ev(() => __sofa.platter().motor(true));
await sleep(1500);
const home = await ev(() => __sofa.head());
check('the motor pulls it back to speed', home.rolling && home.speed > 0.9, JSON.stringify(home));

// 3 — a record longer than the tape is refused in words; the one on it stays.
const refuse = await ev(() => ({ why: __sofa.refuse(26 * 60 + 40), loaded: __sofa.loaded()?.name }));
check('a 26:40 record is refused in words', refuse.why === 'this record runs 26:40; the tape holds 24:59 — cut it shorter first', String(refuse.why));
check('…and the record on the turntable is untouched', refuse.loaded === 'tone');
check('no page errors', pageErrors === 0, String(pageErrors));

await ctx.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
