// Getting a record onto the turntable: decode, resample if the tape's rate
// says so, and land it on track 1 in one import — milliseconds, not the
// record's own length (T-035 upstream). This is what syrup's `print.ts`
// waited a whole record for, and what the plan said to delete on arrival.
import type { DeckController } from '@sk/audio/deck';
import { BLOCK_FRAMES, XPORT } from '@sk/audio/tape-fmt.gen';
import type { Wave } from '../platter/waveform';

/** `m:ss` from frames, floored — the words a refusal is made of. */
export function mmss(frames: number, rate: number): string {
  const s = Math.floor(Math.max(0, frames) / rate);
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Does a record of `frames` fit a tape of `tapeFrames`? One block is kept
 * clear at the end for the seam. A record that does not fit is refused in
 * words before anything touches the deck — never trimmed to fit.
 */
export function fits(frames: number, tapeFrames: number, rate: number): { ok: true } | { ok: false; why: string } {
  if (!Number.isFinite(frames) || frames <= 0) return { ok: false, why: 'this record is empty' };
  const room = tapeFrames - BLOCK_FRAMES;
  if (frames > room) {
    return { ok: false, why: `this record runs ${mmss(frames, rate)}; the tape holds ${mmss(room, rate)} — cut it shorter first` };
  }
  return { ok: true };
}

/**
 * Resample to the tape's rate with an OfflineAudioContext. A no-op whenever
 * the record was decoded on the context pinned to the tape (boot.ts), which
 * is every drop; the path exists for a buffer that arrived some other way.
 */
export async function resample(buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === rate) return buffer;
  const frames = Math.ceil((buffer.length * rate) / buffer.sampleRate);
  const off = new OfflineAudioContext(Math.max(1, buffer.numberOfChannels), frames, rate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

/** The record's wave for the groove, straight from the decoded buffer: per
 *  bin the lowest and highest sample, mono, normalised to the record's peak.
 *  The same shape syrup's `waveformOf` makes from a WAV, without the second
 *  decode. Pure, so a test can hand it any buffer-shaped object. */
export function waveOfBuffer(
  buffer: { length: number; numberOfChannels: number; getChannelData(c: number): Float32Array },
  bins: number,
): Wave {
  const n = buffer.length;
  const ch = Math.max(1, buffer.numberOfChannels);
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  const per = n / bins;
  const chans = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let peak = 0;
  for (let b = 0; b < bins; b += 1) {
    const i0 = Math.floor(b * per);
    const i1 = Math.max(i0 + 1, Math.min(n, Math.floor((b + 1) * per)));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = i0; i < i1; i += 1) {
      let v = 0;
      for (const d of chans) v += d[i] ?? 0;
      v /= ch;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo === Infinity ? 0 : lo;
    max[b] = hi === -Infinity ? 0 : hi;
    peak = Math.max(peak, Math.abs(lo), Math.abs(hi));
  }
  if (peak > 0) {
    for (let b = 0; b < bins; b += 1) {
      min[b] = (min[b] ?? 0) / peak;
      max[b] = (max[b] ?? 0) / peak;
    }
  }
  return { min, max };
}

/**
 * Poll `cond` every 50 ms, ticking the deck each time. The deck's take
 * tracking rides on `tick()`, which the page drives from rAF — and rAF stops
 * dead in a background tab. A landing must finish where it started.
 */
function waitFor(deck: DeckController, cond: () => boolean, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const poll = (): void => {
      deck.tick();
      if (cond()) resolve(true);
      else if (performance.now() - t0 > ms) resolve(false);
      else setTimeout(poll, 50);
    };
    poll();
  });
}

/**
 * Land `buffer` on track 1 of `deck` from frame 0, replacing whatever was
 * there, as one journal commit (undo brings the last record back). Resolves
 * once the take is on tape. Refuses in words — a record that does not fit,
 * a deck that will not come to rest, a take or an import in flight.
 */
export async function landPcm(deck: DeckController, buffer: AudioBuffer, label: string): Promise<{ frames: number }> {
  const rate = deck.tape.sampleRate;
  const pcm = await resample(buffer, rate);
  const room = fits(pcm.length, deck.tape.lengthFrames, rate);
  if (!room.ok) throw new Error(room.why);
  // The deck refuses an import while it is braking or mid-take, and a seek
  // sent to a braking transport is parked until it stops. Let it come to rest
  // first — it is a machine.
  deck.stop();
  const stopped = await waitFor(deck, () => deck.status().state === XPORT.STOPPED, 3000);
  if (!stopped) throw new Error('the turntable did not come to rest — try again');
  // A clean surface: the record that was on is gone (one commit, undoable).
  if (deck.tape.clips[0]?.length) await deck.erase(0, 0, deck.tape.lengthFrames);
  // And no loop left over from the record before, or the new one wraps at
  // the old out point and stacks on itself.
  deck.setLoop(0, 0, false);
  const l = pcm.getChannelData(0);
  const r = pcm.numberOfChannels > 1 ? pcm.getChannelData(1) : l;
  await deck.importPcm(0, 0, { l, r }, rate, { label, origin: 'import' });
  deck.seek(0);
  return { frames: pcm.length };
}
