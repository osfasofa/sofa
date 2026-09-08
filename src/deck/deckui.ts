// The turntable: one deck, one platter, and the wiring between them lifted
// from syrup's DeckUI (its main.ts — the platter → deck seams) with everything
// a listening room does not need left behind: no chop, no bounce, no beat
// bounce, no cassette, no crossfader, no second deck. The platter owns the
// deck's SPEED and writes one position (the head set down); the room (S1)
// owns which record is on and where the shared head is.
import type { DeckController } from '@sk/audio/deck';
import { XPORT } from '@sk/audio/tape-fmt.gen';
import type { DbProfile } from '@sk/storage/db';
import { bootDeck } from '../decks/boot';
import { Platter, type GrooveMark } from '../platter/platter';
import { landPcm, waveOfBuffer } from './land';

/** The hardest scratch the platter asks for, in rate units: 4×, the deck's
 *  ceiling (T-034 upstream: `feel({speedMax})` raises the clamp to it). */
export const SCRATCH_MAX = 4;
/** Bins of waveform along the groove. */
const WAVE_BINS = 720;
/** The deck's rate follower for a hand on a platter, ms (T-034 upstream). */
const HAND_TAU_MS = 10;

export interface Loaded {
  /** The record's identity for the room — a file name until S1 makes it an entry id. */
  id: string;
  name: string;
  /** Frames on the tape, at the tape's rate. */
  frames: number;
  rate: number;
}

export interface DeckEvents {
  /** The one thing that may resume the AudioContext: a gesture. */
  resume(): void;
  /** A hand went on (true) or came off (false) the platter. */
  onHand?(held: boolean): void;
  /** The head was set down at `u`, 0…1 of the record. */
  onSeek?(u: number): void;
  /** A file arrived at the drop or the picker. */
  onFile?(file: File): void;
}

export interface Head {
  /** Tape frames. */
  pos: number;
  /** Seconds into the record. */
  secs: number;
  /** Rate: 1 is the record's own speed, negative is backwards, 0 is still. */
  speed: number;
  rolling: boolean;
}

export function fmtTime(frames: number, sr: number): string {
  const s = Math.max(0, frames) / sr;
  const m = Math.floor(s / 60);
  return `${String(m)}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

export class DeckUI {
  deck: DeckController | null = null;
  readonly platter: Platter;
  loaded: Loaded | null = null;
  /** True while a record is landing: the platter is disabled and drops wait. */
  landing = false;
  /** Marks on the groove (S3): dots the platter draws with the record. */
  marks: GrooveMark[] = [];
  private held = false;
  private readonly root: HTMLElement;
  private readonly dropEl: HTMLElement;
  private readonly fileEl: HTMLInputElement;
  private readonly statusEl: HTMLElement;
  private readonly counterEl: HTMLElement;
  private readonly meterEl: HTMLElement;
  private readonly motorBtn: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly ctx: AudioContext,
    private readonly into: AudioNode,
    private readonly ev: DeckEvents,
  ) {
    this.root = root;
    const q = <T extends HTMLElement>(sel: string): T => {
      const e = this.root.querySelector<T>(sel);
      if (e === null) throw new Error(`the turntable is missing ${sel}`);
      return e;
    };
    this.dropEl = q('.drop');
    this.fileEl = q<HTMLInputElement>('.file');
    this.statusEl = q('.status');
    this.counterEl = q('.counter');
    this.meterEl = q('.meter');
    this.motorBtn = q<HTMLButtonElement>('.motor');

    // The platter owns the deck's speed. The deck rolls while anything moves
    // the platter and stops when the motor is off and the record has come to
    // rest — the platter, not a button, is the transport (syrup's rule).
    this.platter = new Platter(q<HTMLCanvasElement>('.disc'), SCRATCH_MAX, {
      // The head set down on the groove: the record goes there — the one
      // position the platter ever writes, and by the hand, not the motor.
      onSeek: (u) => {
        const d = this.deck;
        const clip = d?.tape.clips[0]?.[0];
        if (d && clip && clip.stop > clip.start && !this.landing) d.seek(Math.round(clip.start + u * (clip.stop - clip.start)));
        this.ev.onSeek?.(u);
      },
      onPivot: () => undefined,
      onSpeed: (r) => {
        const d = this.deck;
        if (!d || this.landing) return;
        // The deck brakes itself when the record runs off either end and
        // then sits STOPPED. The platter is the transport, so when it asks
        // for a speed the tape can honour from there — forward with tape
        // ahead, backward with tape behind — roll again. Never for a speed
        // that would only hit the same wall: that churns the state machine
        // every quantum.
        const s = d.status();
        const parked = s.state === XPORT.STOPPED || s.state === XPORT.BRAKING;
        const canRoll = (r > 0 && s.pos < s.lengthFrames) || (r < 0 && s.pos > 0);
        if (parked && canRoll && Math.abs(r) > 1e-3) d.play();
        d.speed(Math.max(-s.speedMax, Math.min(s.speedMax, r)));
      },
      onEngage: () => {
        if (!this.deck || this.landing) return;
        this.ev.resume();
        const st = this.deck.status().state;
        if (st === XPORT.STOPPED || st === XPORT.BRAKING) this.deck.play();
      },
      onRest: () => {
        if (this.deck && !this.landing) this.deck.stop();
      },
    });

    this.dropEl.addEventListener('click', () => this.fileEl.click());
    this.fileEl.addEventListener('change', () => {
      const f = this.fileEl.files?.[0];
      if (f) this.ev.onFile?.(f);
      this.fileEl.value = '';
    });
    for (const evName of ['dragenter', 'dragover'] as const) {
      this.dropEl.addEventListener(evName, (e) => {
        e.preventDefault();
        this.dropEl.classList.add('over');
      });
    }
    this.dropEl.addEventListener('dragleave', () => this.dropEl.classList.remove('over'));
    this.dropEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropEl.classList.remove('over');
      const f = e.dataTransfer?.files[0];
      if (f) this.ev.onFile?.(f);
    });
    this.motorBtn.addEventListener('click', () => {
      if (!this.deck || this.landing) return;
      this.ev.resume();
      this.motor(!this.platter.state.on);
    });
  }

  /** Boot the deck and give it a turntable's feel: a hand the capstan follows
   *  in ten milliseconds, and a 4× ceiling for the scratch. */
  async boot(profile: DbProfile): Promise<void> {
    this.deck = await bootDeck(this.ctx, profile, this.into);
    this.deck.feel({ followTauMs: HAND_TAU_MS, speedMax: SCRATCH_MAX });
    this.dropEl.textContent = 'no record — drop a file, or tap to pick one';
  }

  /** Motor on: the record plays at its speed. Off: it brakes to a stop. */
  motor(on: boolean): void {
    this.platter.motor(on);
    this.motorBtn.classList.toggle('on', on);
  }

  /**
   * Put a record on: land `buffer` on the tape (milliseconds), draw its
   * groove, and start the motor. Refuses in words; a refusal leaves whatever
   * was on the turntable exactly where it was.
   */
  async land(id: string, name: string, buffer: AudioBuffer): Promise<Loaded> {
    const d = this.deck;
    if (!d) throw new Error('the turntable is still waking — try again in a moment');
    if (this.landing) throw new Error('a record is already landing');
    this.landing = true;
    this.platter.enabled = false;
    this.motor(false);
    this.dropEl.classList.add('busy');
    this.dropEl.textContent = `landing ${name}…`;
    try {
      const { frames } = await landPcm(d, buffer, name);
      this.loaded = { id, name, frames, rate: d.tape.sampleRate };
      this.platter.setWave(waveOfBuffer(buffer, WAVE_BINS));
      this.dropEl.textContent = name;
      return this.loaded;
    } catch (err) {
      this.dropEl.textContent = this.loaded ? this.loaded.name : 'no record — drop a file, or tap to pick one';
      throw err;
    } finally {
      this.landing = false;
      this.platter.enabled = true;
      this.dropEl.classList.remove('busy');
    }
  }

  /** Where the head is right now, read off the deck's shared memory. */
  head(): Head {
    const d = this.deck;
    if (!d) return { pos: 0, secs: 0, speed: 0, rolling: false };
    const s = d.status();
    const clip = d.tape.clips[0]?.[0];
    const start = clip?.start ?? 0;
    return {
      pos: s.pos,
      secs: (s.pos - start) / s.sampleRate,
      speed: s.speed,
      rolling: s.state === XPORT.ROLLING || s.state === XPORT.SPINUP,
    };
  }

  /** Once per animation frame: the deck's bookkeeping, the groove, the platter, the readouts. */
  frame(nowMs: number): void {
    const d = this.deck;
    if (!d) return;
    d.tick();
    const s = d.status();
    const clip = d.tape.clips[0]?.[0];
    // The deck parks itself at the tape's ends (clamp, brake, STOPPED), and
    // a speed it was already sent does not wake it. If the platter is
    // turning and the tape can honour it from here, roll again.
    if (!this.landing && s.state === XPORT.STOPPED) {
      const w = this.platter.state.omega;
      const canRoll = (w > 0.02 && s.pos < s.lengthFrames) || (w < -0.02 && s.pos > 0);
      if (canRoll) {
        d.play();
        d.speed(Math.max(-s.speedMax, Math.min(s.speedMax, w)));
      }
    }
    if (clip && clip.stop > clip.start) {
      const len = clip.stop - clip.start;
      const frac = (f: number): number => (f - clip.start) / len;
      this.platter.setGroove({
        progress: frac(s.pos),
        turns: Math.max(2, Math.min(16, Math.round(len / s.sampleRate / 1.8))),
        loop: null,
        region: null,
        bars: null,
        level: s.outPeak,
        marks: this.marks,
      });
    } else {
      this.platter.setGroove(null);
    }
    this.platter.tick(nowMs);
    if (this.platter.held !== this.held) {
      this.held = this.platter.held;
      this.ev.onHand?.(this.held);
    }
    const start = clip?.start ?? 0;
    this.counterEl.textContent = fmtTime(s.pos - start, s.sampleRate);
    const bar = this.meterEl.firstElementChild as HTMLElement | null;
    if (bar) bar.style.width = `${String(Math.min(100, s.outPeak * 100))}%`;
    this.meterEl.classList.toggle('hot', s.outPeak > 0.98);
    if (!this.landing) {
      const rolling = s.state === XPORT.ROLLING || s.state === XPORT.SPINUP;
      this.statusEl.textContent = s.dead
        ? 'the deck died — reload'
        : (s.notice ?? (this.platter.held ? 'in hand' : rolling ? `${s.speed.toFixed(2)}×` : this.loaded ? 'still' : ''));
    }
  }
}
