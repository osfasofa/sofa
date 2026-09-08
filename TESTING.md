# TESTING — the torture checklist

Rows are marked only when someone watched them pass: ✅ passed (say what "passed" meant),
⚠️ passed with a caveat, ⬜ not run. A checklist that hides its unrun rows is worse than none.

## S0 — the skeleton

| # | row | state | what happened |
|---|---|---|---|
| 1 | `just check-all` green | ✅ | 2026-09-07: typecheck, lint, 24 node tests incl. the charter registry test (run as the npm scripts; `just` was not on the box) |
| 2 | `tests/browser/skeleton.mjs`: boots isolated on a 25-minute tape | ✅ | 2026-09-07, headless Chromium at 44.1 kHz: ready in 900 ms, 66 150 000 frames |
| 3 | …a dropped file lands in milliseconds and plays | ✅ | a 6 s WAV: landed, rolling at 0.99× after 1.2 s |
| 4 | …a backspin runs the tape backwards; the motor pulls it home | ✅ | `fling(-2)` → speed −1.0 within 250 ms; motor on → 0.997× within 1.5 s |
| 5 | …a 26:40 record is refused in words, the one on the turntable untouched | ✅ | "this record runs 26:40; the tape holds 24:59 — cut it shorter first"; the tone stayed on |
| 6 | a same-tab reload comes back with the record and no stuck lock (T-036) | ⬜ | |
| 7 | a phone (iOS Safari): boots at 44.1 kHz, a drop lands, the platter answers a finger | ⬜ | |
| 8 | two tabs: the second says the turntable is held elsewhere, never hangs | ⬜ | |

## Standing rows (every increment from S1)

| row | state |
|---|---|
| multi-device: two real devices, not two tabs | ⬜ |
| offline / reunion: both sides wind while apart, converge on reconnect | ⬜ |
| midnight: one seat leaves, another opens the link cold hours later, the room is there | ⬜ |
| refresh mid-session: no replay flicker, no dropped local state | ⬜ |
| wrong key / no key: fails loud (`SpoolKeyError`), never silent garbage; an empty room says it may be a wrong key | ⬜ |
| the needle down: a pasted link fails in words, never a hang | ⬜ |
| the auto-advance race: two online seats, one winning `turntable` per advance | ⬜ |
| a record at the tape's limit | ⬜ |
| the 8 MiB counter: warns at 6, the room still opens | ⬜ |
