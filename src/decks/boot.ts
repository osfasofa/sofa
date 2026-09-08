// Booting the platform's deck for a turntable.
//
// The AudioContext is PINNED to the tape's sample rate (the recorder's lesson,
// found on the first phone test): the deck records only when tape rate ==
// context rate, and iOS flips the hardware rate between playback-only and mic
// sessions. With an explicit rate the browser resamples instead. Fresh
// install: the nearer of 44 100 / 48 000 to the device rate — a 16 kHz
// Bluetooth context still makes a 44.1 tape, never a 16 kHz one.
import { DeckController } from '@sk/audio/deck';
import { peekTapeRate, type DbProfile } from '@sk/storage/db';

export async function makeContext(profile: DbProfile): Promise<AudioContext> {
  let rate: number | null = null;
  try {
    rate = await peekTapeRate(profile);
  } catch {
    rate = null; // storage trouble surfaces properly in DeckController.boot
  }
  if (rate === null) {
    const probe = new AudioContext();
    rate = Math.abs(probe.sampleRate - 44100) < Math.abs(probe.sampleRate - 48000) ? 44100 : 48000;
    if (probe.sampleRate === rate) {
      void probe.suspend();
      return probe;
    }
    await probe.close();
  }
  return new AudioContext({ sampleRate: rate });
}

/**
 * Boot one deck and hand its output to `into` instead of the speakers. The
 * platform's `bootEngine` wires the node straight to `ctx.destination`; a
 * turntable's output belongs to the crossfader, so it is re-routed here, once,
 * before anything plays. `Engine.node` is public for exactly this.
 */
export async function bootDeck(ctx: AudioContext, profile: DbProfile, into: AudioNode): Promise<DeckController> {
  const deck = await DeckController.boot(ctx, profile);
  deck.engine.node.disconnect();
  deck.engine.node.connect(into);
  deck.monitor(false);
  return deck;
}

/**
 * Let go of the tape NOW — for `pagehide`. The platform's own since the pin
 * moved to e5d7f30 (T-036, our ask 3, delivered): `shutdown({ now: true })`
 * terminates the worker and releases the OPFS handles and the web lock
 * synchronously — the only release a dying page can rely on. The reach past
 * the private worker this used to do is gone. A page that releases on
 * `pagehide` must reload on a bfcache restore (`pageshow` with `persisted`),
 * which main.ts does.
 */
export function releaseDeck(deck: DeckController): void {
  void deck.shutdown({ now: true });
}

/**
 * One page at a time. The decks' OPFS handles are exclusive, so a second tab
 * would not boot — it would wait, silently, for ever. Claim a page-wide lock
 * first; if another tab holds it, say so and do not boot. The lock is held
 * until the page dies, which releases it along with the tapes.
 */
export function claimPage(): Promise<boolean> {
  if (!('locks' in navigator)) return Promise.resolve(true);
  return new Promise((resolve) => {
    void navigator.locks.request('sofa-page', { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      if (lock === null) return Promise.resolve();
      return new Promise<never>(() => {}); // held until the page is gone
    });
  });
}
