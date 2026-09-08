// The page: boot the turntable, take a file, land it, keep the frames coming.
// S0 of the plan (docs/PLAN.md): a listening room with nobody in it yet — the
// room, the seats and the shared head are S1; the needle is S2.
import { BRAND } from './brand';
import { DeckUI } from './deck/deckui';
import { fits as fitsFrames } from './deck/land';
import { claimPage, makeContext, releaseDeck } from './decks/boot';
import { DECK } from './decks/profiles';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (e === null) throw new Error(`#${id} is missing`);
  return e as T;
}
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

document.title = BRAND;
el('brand').textContent = BRAND;
const errEl = el('err');
const say = (text: string): void => {
  errEl.textContent = text;
};

// One page at a time: the tape's OPFS handles are exclusive, and a second
// tab would wait for them silently, for ever.
if (!(await claimPage())) {
  say('another tab of this page holds the turntable — close it, or listen there');
  throw new Error('the page is held elsewhere');
}

// One context, created suspended and pinned to the tape's rate (boot.ts);
// gestures only ever resume it.
const ctx = await makeContext(DECK);
void ctx.suspend();
const resume = (): void => {
  if (ctx.state !== 'running') void ctx.resume();
};
document.addEventListener('pointerdown', resume, { passive: true });
document.addEventListener('keydown', resume, { passive: true });
const master = ctx.createGain();
master.connect(ctx.destination);

const ui = new DeckUI(el('turntable'), ctx, master, {
  resume,
  onFile: (f) => void putFile(f),
});

let bootError: string | null = null;
const booted: Promise<boolean> = ui
  .boot(DECK)
  .then(() => true)
  .catch((e: unknown) => {
    bootError = msg(e);
    say(bootError);
    return false;
  });

/** A dropped file: decode on the pinned context, land it, start the motor. */
async function putFile(file: File): Promise<void> {
  resume();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    await putBuffer(`file:${file.name}`, file.name.replace(/\.[^.]+$/, ''), buffer);
  } catch (e) {
    say(msg(e));
  }
}

async function putBuffer(id: string, name: string, buffer: AudioBuffer): Promise<void> {
  await ui.land(id, name, buffer);
  say('');
  ui.motor(true);
}

// The frame loop drives the deck's bookkeeping, the platter and the readouts.
const frame = (now: number): void => {
  ui.frame(now);
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

// Let go of the tape NOW on the way out (T-036 upstream), and reload when a
// bfcache restore brings a page back whose deck was released.
window.addEventListener('pagehide', () => {
  if (ui.deck) releaseDeck(ui.deck);
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

/** The probe the browser suites drive; nothing on the surface reads it. */
interface Probe {
  ready(): Promise<boolean>;
  bootError(): string | null;
  deck(): DeckUI['deck'];
  head(): ReturnType<DeckUI['head']>;
  loaded(): DeckUI['loaded'];
  platter(): DeckUI['platter'];
  frame(now: number): void;
  /** Land a generated record: `secs` of a sine at `hz`, stereo, at the tape's rate. */
  land(name: string, secs: number, hz?: number): Promise<DeckUI['loaded']>;
  /** The words a record of `secs` would be refused with, or null when it fits. */
  refuse(secs: number): string | null;
  readonly ctx: AudioContext;
}
(globalThis as typeof globalThis & { __sofa?: Probe }).__sofa = {
  ready: () => booted,
  bootError: () => bootError,
  deck: () => ui.deck,
  head: () => ui.head(),
  loaded: () => ui.loaded,
  platter: () => ui.platter,
  frame: (now) => ui.frame(now),
  land: async (name, secs, hz = 220) => {
    const sr = ctx.sampleRate;
    const frames = Math.round(secs * sr);
    const b = ctx.createBuffer(2, frames, sr);
    const l = b.getChannelData(0);
    const r = b.getChannelData(1);
    for (let i = 0; i < frames; i += 1) {
      l[i] = 0.4 * Math.sin((2 * Math.PI * hz * i) / sr);
      r[i] = 0.3 * Math.sin((2 * Math.PI * hz * 1.5 * i) / sr);
    }
    await putBuffer(`gen:${name}`, name, b);
    return ui.loaded;
  },
  refuse: (secs) => {
    const d = ui.deck;
    if (!d) return 'the turntable is still waking';
    const room = fitsFrames(Math.round(secs * d.tape.sampleRate), d.tape.lengthFrames, d.tape.sampleRate);
    return room.ok ? null : room.why;
  },
  get ctx() {
    return ctx;
  },
};

