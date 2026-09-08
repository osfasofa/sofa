// The turntable's motor and brake. Pure and headless; tests/node/motor.test.mjs
// holds it to the numbers in research/00 §6.
//
// `omega` is in RATE units: 1 is nominal (33⅓ rpm, the deck at 1×), 0 is
// still, negative is backwards. Three regimes, and which one applies is the
// whole model:
//
//   held    — a hand is on the platter. The hand owns omega; the caller writes
//             it from the pointer and this file leaves it alone. There is no
//             force feedback in a browser, so the motor does not fight the
//             hand: it waits (research/00 §6, "the hand wins").
//   motor   — a direct-drive motor pulls omega toward `target` with a
//             first-order response reaching 95 % in `spinup` seconds — the
//             SL-1200's 0.7 s to speed. The same law recovers from a drag and
//             from a backspin: a negative omega is pulled through zero and up,
//             which is exactly the pitch-falls-away-and-returns that a real
//             platter does, and it costs no special case.
//   brake   — motor off, hand off: the platter coasts on the platform's
//             flywheel, `decay()` with the brake's time constant. Exact for
//             any dt; never explodes after a backgrounded tab.
import { decay } from '@sk/motion/physics';

export interface MotorSpec {
  /** Seconds from rest to 95 % of target with the motor on. */
  readonly spinup: number;
  /** Coast time constant with the motor off, seconds. */
  readonly brake: number;
}

/** A direct-drive deck: fast up, a firm electronic brake. */
export const TURNTABLE: MotorSpec = { spinup: 0.7, brake: 0.45 };

export interface PlatterState {
  omega: number;
  target: number;
  on: boolean;
  held: boolean;
}

/** Below this |omega| a free platter is at rest. */
export const REST_EPS = 0.01;

/** One step of `dt` seconds. Returns the new omega; does not mutate. */
export function step(s: PlatterState, dt: number, spec: MotorSpec): number {
  if (s.held) return s.omega;
  if (s.on) {
    // 95 % in `spinup` s  ⇒  three time constants.
    const k = 1 - Math.exp((-3 * dt) / spec.spinup);
    const w = s.omega + (s.target - s.omega) * k;
    return Math.abs(w - s.target) < 1e-4 ? s.target : w;
  }
  const w = decay(s.omega, dt, { tau: spec.brake, drag: 0 });
  return Math.abs(w) < REST_EPS ? 0 : w;
}
