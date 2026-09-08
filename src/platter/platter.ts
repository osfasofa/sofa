// The platter — the hero interaction, lifted from syrup (its CHARTER.md §2.1). One canvas disc
// that is both the state display (turning = the record is turning, always)
// and the instrument: grab it and the record follows your hand; a still
// finger holds it; let go and the motor pulls it back to speed, or, motor
// off, it coasts to a stop. Backspin it and it comes back through zero.
//
// The platter produces a SPEED into the deck's capstan, never a position —
// which is what makes it sound like a record and not a slider. The pointer
// handling is the recorder's reel (the platform's src/reel/wheel.ts), which
// has been shipping since its MR milestone and had already solved the stale
// fling, the resting finger and the backgrounded tab; the motor is ours
// (./motor.ts).
import { isFling } from '@sk/motion/physics';
import { cameraAngle, cameraFit, clampPivot, DEFAULT_PIVOT, headAngle, headPoint, nearestOnSpiral, recordAngle, Spring, type Pivot } from './arm';
import { REST_EPS, step, TURNTABLE, type MotorSpec, type PlatterState } from './motor';
import type { Wave } from './waveform';

/** 33⅓ rpm: one turn every 1.8 s at 1×. */
const NOMINAL_RPS = 100 / 180;
/** Velocity smoothing while grabbed, seconds. Short: the hand is in charge. */
const GRAB_TAU = 0.045;
/** A finger that has not moved for this long reads as holding the platter still. */
const STILL_S = 0.06;

export interface PlatterEvents {
  /** A new rate for the deck, already clamped to ±`max`. */
  onSpeed(rate: number): void;
  /** The platter started moving from rest (a hand, or the motor). */
  onEngage(): void;
  /** Motor off, hand off, and the platter has stopped. */
  onRest(): void;
  /** The head was set down on the groove: the record should go there (0…1 of the record). */
  onSeek(progress: number): void;
  /** The arm's pivot was moved by hand. */
  onPivot(p: Pivot): void;
}

/** A change of the record's angle in one frame bigger than this is a jump
 *  (a seek, a loop wrapping, a head set down), not a turn: the spring takes
 *  it. The hardest scratch the deck allows turns less than this per frame. */
const JUMP_RAD = 1.0;

interface GrooveLayout {
  turns: number;
  p: number;
  z: number;
  li: number;
  lo: number;
  /** Fraction of the groove band the spiral spans (a cut ring is thinner). */
  spanR: number;
  m: (t: number) => number;
  spiral: (u: number) => [number, number];
  /** Groove position (0…1) to radius, honouring the cut's thinner band. */
  radial: (u: number) => number;
  /** Radius back to groove position — the head set down at a radius. */
  radialInv: (rad: number) => number;
  /** Groove position back to record time: the inverse of `m`. */
  unmap: (u: number) => number;
}

export interface GrooveMark {
  at: number;
  kind: 'in' | 'out';
  /** 0…3 a kept loop; -1 a point being set. */
  slot: number;
  on: boolean;
}

/** One tint per loop slot; the point being set is white. */
const SLOT_TINTS = ['#ffb347', '#5bd1ff', '#8dff7a', '#ff7ad9'];

export interface Groove {
  /** 0 at the outer edge (the start), 1 at the label (the end). */
  progress: number;
  /** Turns of groove the record has: its length at 1×, one turn per 1.8 s. */
  turns: number;
  /** A held chop: the looped stretch, as progress fractions. */
  loop: { in: number; out: number } | null;
  /** The record's own loop-in/out, as progress fractions; null = the whole record. */
  region: { in: number; out: number } | null;
  /** How long the lit region is in bars, for the cut view's turn count. */
  bars: number | null;
  /** The deck's output peak, linear 0…1: the stylus's brightness. */
  level: number;
  /** Loop points kept on the record, as progress fractions: a dot for in, a
   *  ring for out, tinted by slot; the lit one is the loop that is on. */
  marks: GrooveMark[];
}

/** Level → brightness: 0 at −48 dBFS, 1 at 0 dBFS, with a floor so a silent
 *  stylus can still be found on the groove. */
const LEVEL_FLOOR_DB = -48;
const STYLUS_FLOOR = 0.12;
function brightness(level: number): number {
  if (!(level > 0)) return STYLUS_FLOOR;
  const db = 20 * Math.log10(level);
  const b = Math.max(0, Math.min(1, 1 - db / LEVEL_FLOOR_DB));
  return STYLUS_FLOOR + (1 - STYLUS_FLOOR) * b;
}

/** Zoom animation time constant, seconds. */
const ZOOM_TAU = 0.12;

/**
 * The groove runs from the disc's outer horizon to the label's edge: the
 * record enters at the rim, winds in, and at the label jumps back out to the
 * rim — a torus seen from above, the loop crossing from the inner horizon to
 * the outer one. It spans exactly the disc's edge to the label's edge, by
 * the pixel: no marks on either.
 */
const DISC_R = 0.98;
const LABEL_R = 0.36;
const GROOVE_OUT = DISC_R;
const GROOVE_IN = LABEL_R;
/**
 * Phosphor: the head's wake is PAINTED, not computed. A second bitmap in the
 * record's frame keeps what was drawn on it; every frame it is faded toward
 * clear by a fraction set by this time constant, and the head is stamped
 * again. The wake is therefore a record of time, not of path — a bead that
 * lingers burns brighter — and it costs one fade and one stamp per frame.
 * The clock is the record's: the fade is scaled by its speed.
 */
const PHOSPHOR_TAU = 0.55;

export class Platter {
  readonly state: PlatterState = { omega: 0, target: 1, on: false, held: false };
  private groove: Groove | null = null;
  /** 0 = the record laid out as it is; 1 = the loop pulled out like a spring. */
  private zoom = 0;
  /**
   * How hard the slinky pulls, 0…1. A test knob: 0 draws a latched loop at
   * its true size on the spiral; 1 cuts it: whole turns, seam on one spoke,
   * the rest scrunched into the turn left over. Set from the
   * page's dev controls; the product ships at 1.
   */
  slinky = 0;
  /** The record's waveform along the groove, or null. */
  private wave: Wave | null = null;
  /** The waveform painted along the spiral, in the record's frame; rebuilt
   *  only when what it depends on changes (see `waveKey`). */
  private readonly waveLayer = document.createElement('canvas');
  private readonly waveCx: CanvasRenderingContext2D;
  private waveKey = '';
  private trailKey = '';
  /** The phosphor layer, in the record's frame (unrotated). */
  private readonly trail = document.createElement('canvas');
  private readonly trailCx: CanvasRenderingContext2D;
  private lastDt = 1 / 60;
  private readonly canvas: HTMLCanvasElement;
  private readonly cx: CanvasRenderingContext2D;
  private readonly ev: PlatterEvents;
  private readonly spec: MotorSpec;
  private readonly max: number;
  private angle = 0; // radians, for drawing
  /** Where the stylus is: riding the groove round the disc (the phosphor's
   *  view), or on a fixed arm with the record turning under it. */
  stylus: 'ride' | 'arm' = 'ride';
  /** Which way the groove winds from the outside in. A real record's winds
   *  counter-clockwise (the platter turns clockwise under a fixed stylus),
   *  which is −1 here and the default since 2026-09-05 (owner: "default
   *  view should be groove as cut"); +1 is the mirror the phosphor view
   *  grew up with, kept as a switch. */
  hand: 1 | -1 = -1;
  private lastPointerAngle = 0;
  private lastMoveMs = 0;
  private lastFrameMs = 0;
  /** A turn on a schedule: omega runs from `from` to `to` over `dur` seconds. */
  private script: { t: number; dur: number; from: number; to: number } | null = null;
  private lastSent = NaN;
  private engaged = false;
  enabled = true;
  /** The camera, on the arm: 0 sits still (the platter turns under a fixed
   *  arm), 1 rides the platter (the platter still, the head and the arm go
   *  round it). Between, the platter is seen turning that much slower. */
  camera = 0;
  /** The arm's pivot, by hand; kept per deck by the host. */
  pivot: Pivot = { ...DEFAULT_PIVOT };
  /** The record's angle springs to where the groove says (arm view). */
  private readonly spin = new Spring();
  private lastRec: number | null = null;
  /** This frame's layout, camera turn and pull-back: what the pointer is held against. */
  private lay: GrooveLayout | null = null;
  private fit = 1;
  private cam = 0;
  /** The record's angle as drawn this frame (spring included). */
  private recShown = 0;
  /** A hand on the head (dragging it along the groove) or on the pivot. */
  private drag: { kind: 'head'; u: number } | { kind: 'pivot' } | null = null;

  constructor(canvas: HTMLCanvasElement, max: number, ev: PlatterEvents, spec: MotorSpec = TURNTABLE) {
    this.canvas = canvas;
    this.max = max;
    this.ev = ev;
    this.spec = spec;
    const cx = canvas.getContext('2d');
    const tcx = this.trail.getContext('2d');
    const wcx = this.waveLayer.getContext('2d');
    if (!cx || !tcx || !wcx) throw new Error('no 2d context');
    this.cx = cx;
    this.trailCx = tcx;
    this.waveCx = wcx;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.style.touchAction = 'none'; // the platter is the instrument; never let the browser pan it
  }

  /** The motor's speed: 1 is 33⅓; negative runs the record backwards. */
  setTarget(rate: number): void {
    this.state.target = Math.max(-this.max, Math.min(this.max, rate));
  }

  /** Motor on: pull toward target. Off: brake to a stop. */
  motor(on: boolean): void {
    this.state.on = on;
    if (on) this.engage();
  }

  get held(): boolean {
    return this.state.held;
  }

  /** What is on the record and where the head is; null = a blank disc. */
  setGroove(g: Groove | null): void {
    this.groove = g;
  }

  /** The record's waveform, drawn along the groove; null draws no groove. */
  setWave(w: Wave | null): void {
    this.wave = w;
    this.waveKey = '';
  }

  private engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.ev.onEngage();
  }

  private pointerAngle(e: PointerEvent): number {
    const r = this.canvas.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  /** The pointer in the picture's frame: canvas radii, before the camera's
   *  turn and pull-back — what the arm and the pivot are drawn in. */
  private world(e: PointerEvent): [number, number] {
    return this.worldXY(e.clientX, e.clientY);
  }

  private worldXY(clientX: number, clientY: number): [number, number] {
    const rc = this.canvas.getBoundingClientRect();
    const half = Math.max(1, rc.width / 2);
    const x = (clientX - (rc.left + half)) / half / this.fit;
    const y = (clientY - (rc.top + half)) / half / this.fit;
    const c = Math.cos(-this.cam);
    const s = Math.sin(-this.cam);
    return [x * c - y * s, x * s + y * c];
  }

  /** The record's progress (0…1) under a point on the screen — the nearest
   *  groove in the record's frame as drawn — or null off the band or on a
   *  blank disc. The context menu's "here". */
  grooveAt(clientX: number, clientY: number): number | null {
    const lay = this.lay;
    if (!lay) return null;
    const [wx, wy] = this.worldXY(clientX, clientY);
    const rad = Math.hypot(wx, wy);
    if (rad > GROOVE_OUT + 0.04 || rad < GROOVE_IN - 0.04) return null;
    const r = this.canvas.width / 2;
    const c = Math.cos(-this.recShown);
    const s = Math.sin(-this.recShown);
    const u = nearestOnSpiral((wx * c - wy * s) * r, (wx * s + wy * c) * r, lay.turns, this.hand, lay.radialInv);
    return lay.unmap(u);
  }

  /** The groove position the head is shown at: the record's, or the hand's. */
  private shownU(): number {
    const lay = this.lay;
    if (!lay) return 0;
    return this.drag?.kind === 'head' ? this.drag.u : lay.m(lay.p);
  }

  /** Where the head is drawn, in the picture's frame; null on a blank disc. */
  private headWorld(): [number, number] | null {
    const lay = this.lay;
    if (!lay) return null;
    const r = this.canvas.width / 2;
    const u = this.shownU();
    if (this.stylus === 'arm') return headPoint(this.pivot, lay.radial(u) / r);
    const [hx, hy] = lay.spiral(u);
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return [(hx * c - hy * s) / r, (hx * s + hy * c) / r];
  }

  private down(e: PointerEvent): void {
    this.script = null;
    if (!this.enabled) return;
    this.canvas.setPointerCapture(e.pointerId);
    // A hand on the head lifts it (it goes where it is set down, on the
    // groove); a hand on the pivot moves the arm; anywhere else is the
    // platter, as ever.
    const [wx, wy] = this.world(e);
    const half = Math.max(1, this.canvas.getBoundingClientRect().width / 2);
    const hit = Math.max(0.1, 18 / (half * this.fit));
    const head = this.headWorld();
    if (head && Math.hypot(wx - head[0], wy - head[1]) <= hit) {
      this.drag = { kind: 'head', u: this.shownU() };
      return;
    }
    if (this.stylus === 'arm') {
      const px = Math.cos(this.pivot.a) * this.pivot.d;
      const py = Math.sin(this.pivot.a) * this.pivot.d;
      if (Math.hypot(wx - px, wy - py) <= hit) {
        this.drag = { kind: 'pivot' };
        return;
      }
    }
    this.state.held = true;
    this.state.omega = 0; // finger down = the record is yours, instantly
    this.lastPointerAngle = this.pointerAngle(e);
    this.lastMoveMs = performance.now();
    this.engage();
    this.emit();
  }

  private move(e: PointerEvent): void {
    if (this.drag) {
      this.dragTo(e);
      return;
    }
    if (!this.state.held) return;
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveMs) / 1000;
    const a = this.pointerAngle(e);
    let d = a - this.lastPointerAngle;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    this.lastPointerAngle = a;
    this.lastMoveMs = now;
    const raw = d / dt / (NOMINAL_RPS * 2 * Math.PI);
    const k = 1 - Math.exp(-dt / GRAB_TAU);
    this.state.omega += k * (raw - this.state.omega);
    this.angle += d;
    this.emit();
  }

  private up(e: PointerEvent): void {
    if (this.drag) {
      this.canvas.releasePointerCapture(e.pointerId);
      const d = this.drag;
      this.drag = null;
      if (d.kind === 'head') {
        // Set down: the record goes to the groove under the head.
        const lay = this.lay;
        if (lay) this.ev.onSeek(lay.unmap(d.u));
      } else {
        this.ev.onPivot(this.pivot);
      }
      return;
    }
    if (!this.state.held) return;
    this.canvas.releasePointerCapture(e.pointerId);
    this.state.held = false;
    // A hand that rested before lifting is not a fling.
    if (!isFling(performance.now() - this.lastMoveMs)) this.state.omega = 0;
    // From here the motor (on) or the brake (off) owns omega — see tick().
  }

  /** The hand moves what it holds: the head along the groove, or the pivot. */
  private dragTo(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const [wx, wy] = this.world(e);
    if (d.kind === 'pivot') {
      this.pivot = clampPivot({ a: Math.atan2(wy, wx), d: Math.hypot(wx, wy) });
      return;
    }
    const lay = this.lay;
    if (!lay) return;
    const r = this.canvas.width / 2;
    if (this.stylus === 'arm') {
      // On the arm the head can only slide along the arm's arc: the hand's
      // distance from the spindle picks the turn, and the record turns to
      // bring that groove under it.
      const rad = Math.max(GROOVE_IN, Math.min(GROOVE_OUT, Math.hypot(wx, wy)));
      d.u = Math.max(0, Math.min(1, lay.radialInv(rad * r)));
    } else {
      // Riding: the nearest groove to the hand, in the record's frame.
      const c = Math.cos(-this.angle);
      const s = Math.sin(-this.angle);
      d.u = nearestOnSpiral((wx * c - wy * s) * r, (wx * s + wy * c) * r, lay.turns, this.hand, lay.radialInv);
    }
  }

  /**
   * A hand from another surface — the strip. The same grab as on the disc:
   * the record is the hand's, at the hand's speed, and a still hand holds
   * it; letting go while moving is a fling.
   */
  handOn(): void {
    this.script = null;
    if (!this.enabled) return;
    this.state.held = true;
    this.state.omega = 0;
    this.lastMoveMs = performance.now();
    this.engage();
    this.emit();
  }

  handRate(rate: number): void {
    if (!this.state.held) return;
    this.state.omega = rate;
    if (rate !== 0) this.lastMoveMs = performance.now();
    this.emit();
  }

  handOff(): void {
    if (!this.state.held) return;
    this.state.held = false;
    if (!isFling(performance.now() - this.lastMoveMs)) this.state.omega = 0;
  }

  /** Is a scheduled turn under way? */
  get turning(): boolean {
    return this.script !== null;
  }

  /**
   * Turn the record round on a schedule — the beat bounce's hand. Omega runs
   * from `from` to `to` at a constant rate over `dur` seconds (0 = at once,
   * whatever the motor could do), `elapsed` of them already gone; then the
   * motor owns it again. A hand on the record cancels it.
   */
  turn(from: number, to: number, dur: number, elapsed = 0): void {
    this.state.held = false;
    if (dur <= 0) {
      this.script = null;
      this.state.omega = to;
      this.emit();
      return;
    }
    this.script = { t: Math.max(0, Math.min(dur, elapsed)), dur, from, to };
  }

  /** Programmatic fling — the acceptance harness's hand. */
  fling(rate: number): void {
    this.state.held = false;
    this.state.omega = rate;
    this.engage();
  }

  private emit(): void {
    const v = Math.max(-this.max, Math.min(this.max, this.state.omega));
    if (Math.abs(v - this.lastSent) < 1e-4) return;
    this.lastSent = v;
    this.ev.onSpeed(v);
  }

  /** Call once per animation frame (or from any timer): advances the model and draws. */
  tick(nowMs: number): void {
    // A clock that jumps backwards (sleep, a harness's fake time) must not
    // poison the eases: dt stays in [0, 0.25] and never NaN — a negative dt
    // once sent `zoom` through exp() to infinity and stuck the slinky.
    const dtRaw = this.lastFrameMs === 0 ? 1 / 60 : (nowMs - this.lastFrameMs) / 1000;
    const dt = Number.isFinite(dtRaw) ? Math.min(0.25, Math.max(0, dtRaw)) : 1 / 60;
    if (Number.isFinite(nowMs)) this.lastFrameMs = nowMs;
    this.lastDt = dt;
    if (this.state.held) {
      // A finger that stops moving must read as holding the record still
      // without waiting for a pointermove.
      if ((nowMs - this.lastMoveMs) / 1000 > STILL_S) {
        this.state.omega *= Math.exp(-dt / GRAB_TAU);
        if (Math.abs(this.state.omega) < 0.01) this.state.omega = 0;
      }
    } else if (this.script) {
      const sc = this.script;
      sc.t += dt;
      const k = Math.min(1, sc.t / sc.dur);
      this.state.omega = sc.from + (sc.to - sc.from) * k;
      this.angle += this.state.omega * NOMINAL_RPS * 2 * Math.PI * dt;
      if (k >= 1) this.script = null;
    } else {
      this.state.omega = step(this.state, dt, this.spec);
      this.angle += this.state.omega * NOMINAL_RPS * 2 * Math.PI * dt;
    }
    this.emit();
    // The groove's zoom eases toward "pulled out" while a loop is punched.
    const wantZoom = this.groove?.region ? 1 : 0;
    this.zoom += (wantZoom - this.zoom) * (1 - Math.exp(-dt / ZOOM_TAU));
    if (!Number.isFinite(this.zoom) || Math.abs(this.zoom - wantZoom) < 0.002) this.zoom = wantZoom;
    if (this.engaged && !this.state.on && !this.state.held && Math.abs(this.state.omega) < REST_EPS) {
      this.engaged = false;
      this.ev.onRest();
    }
    this.draw();
  }

  private draw(): void {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(1, Math.round(c.clientWidth * dpr));
    if (c.width !== size || c.height !== size) {
      c.width = size;
      c.height = size;
    }
    const g = this.cx;
    const s = c.width;
    const r = s / 2;
    g.clearRect(0, 0, s, s);
    const lay = this.groove ? this.layout(this.groove, r) : null;
    this.lay = lay;
    const arm = this.stylus === 'arm';
    const shownU = this.shownU();

    // The record's angle. On the arm, one physics: the groove under the
    // head decides it — the record turns until the head's groove is under
    // the head — and a jump (a seek, a loop wrapping, the head set down
    // elsewhere) is taken by the spring, so the record is SEEN spinning to
    // line up. The camera is only a viewpoint on that: still, riding the
    // platter, or between. Riding the groove, the flywheel's angle is the
    // view, as it always was.
    let rec: number;
    let rad = GROOVE_OUT;
    if (arm) {
      rad = lay ? lay.radial(shownU) / r : GROOVE_OUT;
      const target = recordAngle(headAngle(this.pivot, rad), shownU, lay ? lay.turns : 1, this.hand);
      if (this.lastRec !== null) {
        const d = target - this.lastRec;
        if (Math.abs(d) > JUMP_RAD) this.spin.kick(-d);
      }
      this.lastRec = target;
      this.spin.step(this.lastDt);
      rec = target + this.spin.x;
      this.fit = cameraFit(this.pivot, this.camera);
      this.cam = cameraAngle(rec, this.camera);
    } else {
      rec = this.angle;
      this.lastRec = null;
      this.spin.x = 0;
      this.spin.v = 0;
      this.fit = 1;
      this.cam = 0;
    }

    this.recShown = rec;
    g.save();
    g.translate(r, r);
    g.scale(this.fit, this.fit);
    g.rotate(this.cam);

    // The record.
    g.save();
    g.rotate(rec);
    g.beginPath();
    g.arc(0, 0, r * DISC_R, 0, 2 * Math.PI);
    g.fillStyle = '#151016';
    g.fill();
    g.lineWidth = Math.max(1, s * 0.008);
    g.strokeStyle = '#2b1f33';
    g.stroke();
    if (this.groove && lay) this.drawGroove(g, r, s, this.groove, lay, arm ? null : shownU);
    // The label: plain. The groove and the stylus are the only marks.
    g.beginPath();
    g.arc(0, 0, r * LABEL_R, 0, 2 * Math.PI);
    g.fillStyle = '#a05ad6';
    g.fill();
    // Spindle.
    g.beginPath();
    g.arc(0, 0, r * 0.035, 0, 2 * Math.PI);
    g.fillStyle = '#120c14';
    g.fill();
    g.restore();

    if (arm) this.drawArm(g, r, s, rad, this.groove ? brightness(this.groove.level) : STYLUS_FLOOR);
    g.restore();
  }

  /** The tonearm, in the picture's frame over the record: a pivot off the
   *  disc, a straight arm to the head where its arc meets the groove, the
   *  head's ring at the end. Superficial — never in the record's frame. */
  private drawArm(g: CanvasRenderingContext2D, r: number, s: number, rad: number, b: number): void {
    const px = Math.cos(this.pivot.a) * this.pivot.d * r;
    const py = Math.sin(this.pivot.a) * this.pivot.d * r;
    const [hu, hv] = headPoint(this.pivot, rad);
    const hx = hu * r;
    const hy = hv * r;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(232, 220, 239, 0.55)';
    g.lineWidth = Math.max(2, s * 0.008);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(hx, hy);
    g.stroke();
    // Headshell: a short bar across the arm at the head.
    const ang = Math.atan2(hy - py, hx - px);
    const hs = Math.max(6, s * 0.03);
    g.lineWidth = Math.max(3, s * 0.014);
    g.beginPath();
    g.moveTo(hx - Math.cos(ang) * hs, hy - Math.sin(ang) * hs);
    g.lineTo(hx, hy);
    g.stroke();
    // Pivot: lit while a hand moves it.
    const held = this.drag?.kind === 'pivot';
    g.beginPath();
    g.arc(px, py, Math.max(4, s * (held ? 0.026 : 0.02)), 0, Math.PI * 2);
    g.fillStyle = '#2b1f33';
    g.fill();
    g.lineWidth = Math.max(1, s * 0.004);
    g.strokeStyle = held ? 'rgba(232, 220, 239, 0.9)' : 'rgba(232, 220, 239, 0.4)';
    g.stroke();
    this.drawRing(g, hx, hy, s, b, this.drag?.kind === 'head');
    g.restore();
  }

  /**
   * The groove: one spiral from the outer edge to the label, as many turns as
   * the record has at 33⅓ — drawn as the record's own WAVEFORM (each bin a
   * stroke as wide and as light as its loudness) with the phosphor over it:
   * what the stylus paints as it reads, as bright as the sound is loud. The
   * spiral's geometry is the slinky map below; a held
   * chop lights white; the head is a bead on the groove. In the record's own
   * frame, so it turns with it.
   */
  /**
   * Paint the wave into the cached layer. Two passes over the record: the
   * outer edge (max) forwards along the groove, the inner edge (min) back —
   * one closed path, filled — then a bright hairline along the outer edge
   * for the scope look. Amplitude is half the gap between turns, less a
   * hair, so neighbouring turns never touch.
   */
  private paintWave(wave: Wave, r: number, s: number, lay: GrooveLayout): void {
    const { turns, m, spiral, z, li, lo } = lay;
    const c = this.waveLayer;
    if (c.width !== s || c.height !== s) {
      c.width = s;
      c.height = s;
    }
    const g = this.waveCx;
    g.clearRect(0, 0, s, s);
    g.save();
    g.translate(r, r);
    const bins = wave.min.length;
    const gap = (r * (GROOVE_OUT - GROOVE_IN) * lay.spanR) / turns; // radial distance between turns
    const amp = gap * 0.46;
    const edge = (t: number, v: number): [number, number] => {
      const u = m(t);
      const [x, y] = spiral(u);
      // The spiral's normal is (very nearly) radial — and the angle must
      // wind the way the groove does, or the band shears when the groove
      // is cut the other hand.
      const a = this.hand * u * turns * 2 * Math.PI;
      return [x + Math.cos(a) * v * amp, y + Math.sin(a) * v * amp];
    };
    // One pass per stretch of record: the loop at full strength, and — when
    // a cut is under way — the clipped parts fading with the pull, gone
    // entirely at full pull: only the loop's spiral remains.
    const cut = z > 0 && lo > li && li + (1 - lo) > 0;
    const segs: [number, number, number][] = cut
      ? [
          [0, Math.max(0, Math.floor(li * bins) - 1), 1 - z],
          [Math.floor(li * bins), Math.ceil(lo * bins), 1],
          [Math.min(bins - 1, Math.ceil(lo * bins) + 1), bins - 1, 1 - z],
        ]
      : [[0, bins - 1, 1]];
    for (const [b0, b1, alpha] of segs) {
      if (b1 <= b0 || alpha <= 0.004) continue;
      g.globalAlpha = alpha;
      g.beginPath();
      for (let b = b0; b <= b1; b += 1) {
        const [x, y] = edge((b + 0.5) / bins, wave.max[b] ?? 0);
        if (b === b0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      for (let b = b1; b >= b0; b -= 1) {
        const [x, y] = edge((b + 0.5) / bins, wave.min[b] ?? 0);
        g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = 'rgba(160, 90, 214, 0.42)';
      g.fill();
      // The trace: a hairline along the outer edge, brighter.
      g.beginPath();
      for (let b = b0; b <= b1; b += 1) {
        const [x, y] = edge((b + 0.5) / bins, wave.max[b] ?? 0);
        if (b === b0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineWidth = Math.max(0.6, s * 0.0018);
      g.strokeStyle = 'rgba(220, 190, 250, 0.7)';
      g.lineJoin = 'round';
      g.stroke();
      // And the centreline, faint: the groove itself.
      g.beginPath();
      for (let b = b0; b <= b1 + 1; b += 1) {
        const [x, y] = spiral(m(Math.min(1, b / bins)));
        if (b === b0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineWidth = Math.max(0.5, s * 0.0012);
      g.strokeStyle = 'rgba(232, 220, 239, 0.18)';
      g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  /** The groove's geometry for this frame: record time → groove → the disc. */
  private layout(gr: Groove, r: number): GrooveLayout {
    const turns0 = Math.max(1, gr.turns);
    const p = Math.min(1, Math.max(0, gr.progress));
    // The slinky, fully pulled: the loop IS the record (owner, 2026-08-31).
    // As if that loop were cut and pressed: the SPIRAL ITSELF re-lays to
    // the loop's musical length — one turn per bar, plus one leftover turn
    // for the scrunched ends — so a one-bar cut is almost a perfect circle
    // filling the plate, an eight-bar cut is eight turns, and the groove's
    // pitch widens like a camera pushing in. The loop spans whole turns,
    // so its in and its out sit on the SAME spoke and the seam is a clean
    // radial step; everything outside it is a thin band at the rim and at
    // the label, almost as if it were not there. `zoom` eases between "as
    // it is" and "cut"; the seam locks exactly at full pull. `m` maps
    // record time (0…1) to groove (0…1); strokes are walked evenly along
    // the GROOVE — walking them evenly in record time put almost no points
    // in the stretched loop and drew it as a polygon.
    const z = this.zoom * Math.max(0, Math.min(1, this.slinky));
    const reg = gr.region;
    const li = reg ? Math.max(0, Math.min(1, reg.in)) : 0;
    const lo = reg ? Math.max(li, Math.min(1, reg.out)) : 1;
    const ends = li + (1 - lo);
    const stretched = reg !== null && z > 0 && lo - li > 0 && ends > 0;
    // Turns of loop in the cut: its length in bars when the tempo says,
    // else what the old spiral gave it. The loop takes the WHOLE spiral —
    // the clipped parts are not drawn at full pull (owner, 2026-08-31),
    // so no turn is reserved for them: a one-bar cut is one true circle.
    const K = stretched ? (gr.bars !== null && gr.bars > 0 ? Math.max(1, Math.min(16, Math.round(gr.bars))) : Math.max(1, turns0 - 1)) : 1;
    const turnsCut = K;
    const turns = stretched ? turns0 + (turnsCut - turns0) * z : turns0;
    // The cut's band is as thick as its turns deserve: one turn hugs a ring
    // in the middle of the plate — almost a perfect circle — instead of
    // snailing from rim to label; more turns take more of the band. The
    // coil sits centred, and the groove's pitch (and the wave with it)
    // grows as the turns shrink: the camera pushing in.
    const spanRCut = K / (K + 2);
    const spanR = stretched ? 1 + (spanRCut - 1) * z : 1;
    const offR = (1 - spanR) / 2;
    const span = stretched ? (lo - li) * (1 - z) + 1 * z : lo - li;
    const before = stretched ? li * (1 - z) : li;
    const after = 1 - before - span;
    const m = (t: number): number => {
      if (!stretched) return t;
      if (t < li) return li > 0 ? (t / li) * before : 0;
      if (t <= lo) return before + ((t - li) / (lo - li)) * span;
      return before + span + (lo < 1 ? ((t - lo) / (1 - lo)) * after : 0);
    };
    const hand = this.hand;
    const radial = (u: number): number => r * (GROOVE_OUT + (GROOVE_IN - GROOVE_OUT) * (offR + u * spanR));
    const radialInv = (rad: number): number => ((rad / r - GROOVE_OUT) / (GROOVE_IN - GROOVE_OUT) - offR) / Math.max(1e-6, spanR);
    const unmap = (u: number): number => {
      if (!stretched) return u;
      if (u < before) return before > 0 ? (u / before) * li : 0;
      if (u <= before + span) return li + ((u - before) / span) * (lo - li);
      return after > 0 ? lo + ((u - before - span) / after) * (1 - lo) : lo;
    };
    const spiral = (u: number): [number, number] => {
      const a = hand * u * turns * 2 * Math.PI;
      const rad = radial(u);
      return [Math.cos(a) * rad, Math.sin(a) * rad];
    };
    return { turns, p, z, li, lo, spanR, m, spiral, radial, radialInv, unmap };
  }

  private drawGroove(g: CanvasRenderingContext2D, r: number, s: number, gr: Groove, lay: GrooveLayout, ringU: number | null): void {
    const { turns, p, z, li, lo, m, spiral } = lay;
    // The waveform along the groove — a scope trace wrapped around the
    // spiral: a band that swings radially about the groove's centreline by
    // each bin's min and max, sized to the gap between turns. Painted into
    // a cached layer in the record's frame; rebuilt only when the record,
    // the size or the slinky layout changes, and blitted under the rotation.
    const wave = this.wave;
    if (wave && wave.min.length > 1) {
      const key = `${String(s)}|${String(wave.min.length)}|${z.toFixed(3)}|${String(li)}|${String(lo)}|${turns.toFixed(3)}|${String(this.hand)}`;
      if (key !== this.waveKey) {
        this.waveKey = key;
        this.paintWave(wave, r, s, lay);
      }
      g.drawImage(this.waveLayer, -r, -r);
    }

    // The phosphor: fade what the wake layer holds, stamp the head on it in
    // the record's frame, then lay it over the groove inside the rotation.
    {
      const tc = this.trailCx;
      if (this.trail.width !== s || this.trail.height !== s) {
        this.trail.width = s;
        this.trail.height = s;
      }
      // A re-laid groove (the cut easing in or out) leaves the old trail in
      // the old geometry — misleading, so it is wiped when the layout moves.
      const trailKey = lay ? `${lay.turns.toFixed(2)}|${lay.spanR.toFixed(2)}|${lay.z.toFixed(2)}` : 'flat';
      if (trailKey !== this.trailKey) {
        this.trailKey = trailKey;
        tc.clearRect(0, 0, s, s);
      }
      // Decay runs on TAPE time, not wall time: at 1× a wake fades over
      // PHOSPHOR_TAU seconds; slowed, it lingers in proportion; held still,
      // it does not fade at all — the record's own clock, not the room's.
      const fade = 1 - Math.exp((-this.lastDt * Math.abs(this.state.omega)) / PHOSPHOR_TAU);
      tc.globalCompositeOperation = 'destination-out';
      tc.fillStyle = `rgba(0, 0, 0, ${String(fade)})`;
      tc.fillRect(0, 0, s, s);
      tc.globalCompositeOperation = 'source-over';
      // The stylus stamps a point whose brightness is the deck's level: the
      // wake becomes a trace of the sound along the groove.
      const [hx, hy] = spiral(m(p));
      const b = brightness(gr.level);
      const px = Math.max(1.5, s * 0.006);
      tc.fillStyle = `rgba(${String(Math.round(170 + 85 * b))}, ${String(Math.round(120 + 135 * b))}, 255, ${String(0.15 + 0.85 * b)})`;
      tc.fillRect(r + hx - px / 2, r + hy - px / 2, px, px);
      g.drawImage(this.trail, -r, -r);
      // Loop points on the record: they turn with it, over the groove.
      for (const mk of gr.marks) {
        // A mark on the clipped part goes with it as the cut pulls in.
        const clippedOut = gr.region !== null && (mk.at < li || mk.at > lo) ? 1 - z : 1;
        if (clippedOut <= 0.004) continue;
        const [mx, my] = spiral(m(Math.min(1, Math.max(0, mk.at))));
        const tint = mk.slot >= 0 ? (SLOT_TINTS[mk.slot % SLOT_TINTS.length] ?? '#ffffff') : '#ffffff';
        const rad = Math.max(3, s * (mk.on ? 0.014 : 0.011));
        g.beginPath();
        g.arc(mx, my, rad, 0, Math.PI * 2);
        g.globalAlpha = (mk.on ? 1 : 0.6) * clippedOut;
        if (mk.kind === 'in') {
          g.fillStyle = tint;
          g.fill();
        } else {
          g.lineWidth = Math.max(1.5, s * 0.005);
          g.strokeStyle = tint;
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      // The stylus itself: a ring over everything, never painted into the
      // wake — so the head can be found at a glance while the phosphor
      // stays the trace of the sound. Riding, it is here on the groove (and
      // while a hand drags it, where the hand has it); on the arm it is the
      // arm's, drawn with the arm.
      if (ringU !== null) {
        const [rx, ry] = spiral(ringU);
        this.drawRing(g, rx, ry, s, b, this.drag?.kind === 'head');
      }
    }
  }

  /** The head: a ring, brighter as the sound is louder; lit when in a hand. */
  private drawRing(g: CanvasRenderingContext2D, x: number, y: number, s: number, b: number, held: boolean): void {
    const rr = Math.max(4, s * (held ? 0.022 : 0.016));
    g.beginPath();
    g.arc(x, y, rr, 0, Math.PI * 2);
    g.lineWidth = Math.max(1.5, s * 0.004);
    g.strokeStyle = held ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.85)';
    g.stroke();
    g.beginPath();
    g.arc(x, y, rr * 0.35, 0, Math.PI * 2);
    g.fillStyle = `rgba(255, 255, 255, ${String(0.35 + 0.65 * b)})`;
    g.fill();
  }
}
