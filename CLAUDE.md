# SOFA — session guide

Internally this is **sofa**; the shipped surface says whatever `src/brand.ts` says (`SOFA` until
the owner names it). A listening room on the SOFAKIT deck and on spools: one shared turntable,
a crate, seats, a terminal, a private ripper ("the needle"). A sibling of syrup, built the way
syrup is built, lifting its modules as copies.

## Where things are decided (read in this order)

1. **`CHARTER.md`** + `charter.json` — the law. Enforced by `tests/node/charter.test.mjs`, not taste.
2. **`docs/PLAN.md`** — the design of record and the increments S0…S5, each with its acceptance.
3. **`VENDOR.md`** — the platform pin and the rules for it.
4. **`TESTING.md`** — rows marked only when watched. **`NOTES.md`** — evidence filed, the owner's calls.
5. `README.md` — the reserved kinds and the honesty sentences.

## Standing rules

- **Never slow SOFAKIT down.** Upstream needs go as tickets plus tiny additive ops with defaults
  bit-identical (T-043 is the model). Breaking need → pin an older SHA or do it here. Never touch
  `vendor/sofakit`'s working tree from here; `just bump-sofakit <sha>` is a decision, logged in
  `VENDOR.md`.
- **npm-only `spools`**, with a lockfile, pinned `^0.2.x`; never a workspace link, a git
  dependency or a patched SDK. Friction is evidence for the loom's gate (`NOTES.md`), with a
  reproduction — never worked around silently, never a feature request.
- **Never fake pending features** — show "pending".
- **Honesty sentences ship in the surface**, not the docs (`CHARTER.md` §5).
- **The charter word scan** runs over minified bundle literals, the page and the manifest:
  `sofakit`, `reel`, `loom`, `syrup`, `prometheizz`, `synth`, `patch`, `stretch`, `mixer`… are
  forbidden in anything a user can see. CSS `align-*: stretch` would trip a page scan — use grid
  defaults.
- **Presence is awareness, never an entry. The head is derived, never stored.** (CHARTER §6.)
- **Commit style:** a one-line title in the house voice, an explanatory body, `Co-Authored-By`
  for the model, plus a `Claude-Session:` trailer.

## Build / test

Everything goes through `just` (see `Justfile`; the wasm must build via `cd vendor/sofakit`,
never `--manifest-path`):

- `just dev` — wasm, then vite with isolation headers (`:5173`).
- `just check-all` — typecheck, lint, node tests (incl. the charter test). Run before any commit.
- `node tests/browser/skeleton.mjs` — the S0 run in a real browser (`tests/browser/README.md`).
- `just stage` / `just deploy` — once the Vercel project is linked; prod only on the owner's word.

## The code (S0)

`src/main.ts` boots: `claimPage` → `makeContext` (pinned to the tape rate) → `DeckUI.boot` →
a rAF loop → `window.__sofa`, the probe the browser suites drive. `src/deck/deckui.ts` is the
one-deck UI (the platter → deck seams lifted from syrup's DeckUI); `src/deck/land.ts` is decode
→ resample → `importPcm` (there is no print path here). `src/platter/*` is syrup's, verbatim.
`src/decks/boot.ts` pins the context; `src/decks/profiles.ts` names the tape (25 minutes).
