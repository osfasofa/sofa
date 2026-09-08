# The platform pin — `vendor/sofakit`

The Sofa is built on the deck pillar of the SOFAKIT platform (its ADR-0002: a two-pillar core,
the **deck** and the **graph**, with instruments composing either). The platform is not
published as a package, so it is consumed as a git submodule pinned to one commit, exactly as
syrup does. The pin only moves through `just bump-sofakit <sha>`, and every move is logged here
with its reason.

What the Sofa imports from the submodule — and the registry test (`tests/node/charter.test.mjs`)
fails the build on anything outside this set:

| Path | What |
|---|---|
| `src/audio/deck.ts` | `DeckController` — the tape transport, import, export, feel and journal API |
| `src/audio/host.ts`, `abi.ts`, `spsc.ts`, `tape-layout.ts`, `tape-fmt.gen.ts` | the worklet host, the command ring, the shared-memory layout, the generated tape-format constants |
| `src/audio/engine.worklet.ts` | the deck-only AudioWorklet processor (zero imports; bundled standalone) |
| `src/workers/tape.worker.ts`, `tape-protocol.ts`, `peaks.ts`, `assembly.ts` | the OPFS worker, its protocol, the peak pyramid, the import assembler |
| `src/storage/db.ts` | the per-instrument IndexedDB profile and schema (`DbProfile.tapeSecs`, T-043) |
| `src/motion/physics.ts` | the dependency-free flywheel |

Never imported, by charter: anything under `src/audio/graph*`, `src/workers/graph.worker.ts`,
`src/audio/telemetry.ts`, `src/storage/db-studio.ts`, `src/surface/`, `src/ui/`, `src/screen/`,
`src/app/`, `src/reel/`, `src/loom/`.

The wasm (`sk_dsp.wasm`) is built **from inside the submodule directory** — cargo reads
`.cargo/config.toml` and `rust-toolchain.toml` from the current directory, not from
`--manifest-path`, and without them the worklet links without imported memory and dies on boot.

## Asks — what the Sofa needs from the platform and cannot do from TypeScript

Each is a tiny additive change, filed as a ticket upstream with a PR that keeps every golden
test bit-identical at defaults. Until each lands, the Sofa does the honest thing and says so.

1. **A tape as long as the record** — upstream **T-043** /
   [#96](https://github.com/osfasofa/sofakit/pull/96) — **on this pin**: `DbProfile.tapeSecs`,
   `newTape({secs})`, the map raised to 93 minutes at 48 kHz, refusals in words. Filed and
   built from this repo's planning session; the pin moves to `main` when #96 merges.

Nothing else is open: instant PCM import (T-035), the hand (T-034), the strips (T-037) and the
immediate `shutdown` (T-036) — every ask syrup filed — are on this pin.

## Log

- **2026-09-07 — pinned at `413fd63`** (`claude/sofakit-streaming-dubplate-hug801`, the T-043
  PR branch, one commit past `main`'s `b2caa01`). First pin. Brings T-043 with everything on
  `main`: `importPcm` (so there is no print path here at all), `feel({followTauMs, speedMax})`,
  the four strips, `shutdown({now: true})`. Move to `main` once #96 merges.
