// The tonearm and the camera: the geometry under the platter's arm view,
// kept pure so it can be held to numbers.
//
// One physics. The groove is a spiral in the record's frame; the head sits
// on the groove at position u (0 at the rim, 1 at the label). On the arm the
// head can only be where the arm's arc crosses the groove's circle of that
// radius, so the RECORD'S angle is decided: it turns until the groove point
// u is under the head. Everything else is the camera's viewpoint — still
// (the arm fixed, the platter turns) or riding the platter (the platter
// still, the head and the arm go round it), or anywhere between.
//
// Screen coordinates throughout: y down, angles clockwise, lengths in units
// of the canvas radius.

export interface Pivot {
  /** The pivot's angle from the spindle. */
  a: number;
  /** The pivot's distance from the spindle, in canvas radii — outside the disc. */
  d: number;
}

export const DEFAULT_PIVOT: Pivot = { a: -Math.PI / 4 + 0.1, d: 1.18 };
/** The pivot stays off the disc and inside the square the canvas gives it. */
export const PIVOT_D_MIN = 1.06;
export const PIVOT_XY_MAX = 0.95;
/** The arm reaches this much past the spindle: a real arm's overhang, so
 *  its arc crosses the whole groove band at a shallow angle. */
export const OVERHANG = 0.04;

export function armLength(p: Pivot): number {
  return p.d + OVERHANG;
}

/** Keep a dragged pivot off the disc and on the canvas. */
export function clampPivot(p: Pivot): Pivot {
  let x = Math.cos(p.a) * p.d;
  let y = Math.sin(p.a) * p.d;
  x = Math.max(-PIVOT_XY_MAX, Math.min(PIVOT_XY_MAX, x));
  y = Math.max(-PIVOT_XY_MAX, Math.min(PIVOT_XY_MAX, y));
  let d = Math.hypot(x, y);
  let a = Math.atan2(y, x);
  if (d < PIVOT_D_MIN) {
    // Pushed onto the disc: slide it out along its own ray, then back into
    // the square along the nearer corner if that overshot.
    d = PIVOT_D_MIN;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    if (Math.abs(cx) > PIVOT_XY_MAX || Math.abs(cy) > PIVOT_XY_MAX) {
      const c = Math.PI / 4;
      const q = Math.round((a - c) / (Math.PI / 2)) * (Math.PI / 2) + c;
      a = q;
      d = Math.max(PIVOT_D_MIN, Math.min(Math.SQRT2 * PIVOT_XY_MAX, d));
    }
  }
  return { a, d };
}

/**
 * The head's angle from the spindle when the stylus sits on the groove at
 * radius `rad`: where the arm's arc (length L about the pivot) meets the
 * circle of that radius. Of the two crossings the arm takes the one on the
 * counter-clockwise side of the pivot, as a right-hand arm does.
 */
export function headAngle(p: Pivot, rad: number): number {
  const L = armLength(p);
  const r = Math.max(1e-6, rad);
  const c = (p.d * p.d + r * r - L * L) / (2 * p.d * r);
  const beta = Math.acos(Math.max(-1, Math.min(1, c)));
  return p.a - beta;
}

/** Where the head is, in canvas radii. */
export function headPoint(p: Pivot, rad: number): [number, number] {
  const th = headAngle(p, rad);
  return [Math.cos(th) * rad, Math.sin(th) * rad];
}

/**
 * The record's angle that puts groove point `u` under a head at `thetaHead`:
 * the spiral point's own angle in the record's frame is hand·u·turns·2π.
 */
export function recordAngle(thetaHead: number, u: number, turns: number, hand: 1 | -1): number {
  return thetaHead - hand * u * turns * 2 * Math.PI;
}

/** The camera's turn for a record at `rec`: 0 stays still, 1 rides the platter. */
export function cameraAngle(rec: number, ride: number): number {
  return ride === 0 ? 0 : -ride * rec;
}

/**
 * How much the picture pulls back so the pivot's whole orbit fits the canvas
 * as the camera starts to ride: 1 with the camera still (the pivot lives in
 * a corner), the pivot's reach otherwise — settled by a third of the way.
 */
export function cameraFit(p: Pivot, ride: number): number {
  const full = 1 / (p.d + 0.08);
  const s = Math.max(0, Math.min(1, ride * 3));
  return 1 - s * (1 - full);
}

/**
 * The groove position nearest a point in the record's frame: the turn at
 * that radius, then along the groove to the point's own angle. `radialInv`
 * is the spiral's radius → u map (the layout's); `hand` and `turns` are the
 * spiral's. The result stays on the groove: obeying it is the point.
 */
export function nearestOnSpiral(x: number, y: number, turns: number, hand: 1 | -1, radialInv: (rad: number) => number): number {
  const rad = Math.hypot(x, y);
  const ang = Math.atan2(y, x);
  const u0 = Math.max(0, Math.min(1, radialInv(rad)));
  const per = hand * turns * 2 * Math.PI; // radians of groove angle per unit u
  let d = ang - u0 * per;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // wrapped to (−π, π]
  return Math.max(0, Math.min(1, u0 + d / per));
}

/** A hard spring: a kicked offset that pulls back to zero, a little past it. */
export class Spring {
  x = 0;
  v = 0;

  constructor(
    /** Natural frequency, rad/s: how hard. */
    private readonly omega = 22,
    /** Damping ratio: under 1 overshoots a touch, like a platter settling. */
    private readonly zeta = 0.72,
  ) {}

  /** The picture jumped by `dx`: absorb it, so it can be seen springing back. */
  kick(dx: number): void {
    this.x += dx;
  }

  get settled(): boolean {
    return Math.abs(this.x) < 1e-4 && Math.abs(this.v) < 1e-3;
  }

  /** Advance `dt` seconds; small fixed substeps keep a long frame stable. */
  step(dt: number): void {
    if (this.settled) {
      this.x = 0;
      this.v = 0;
      return;
    }
    const h = 0.004;
    let left = Math.max(0, Math.min(0.5, dt));
    while (left > 0) {
      const s = Math.min(h, left);
      const a = -this.omega * this.omega * this.x - 2 * this.zeta * this.omega * this.v;
      this.v += a * s;
      this.x += this.v * s;
      left -= s;
    }
  }
}
