# The Sofa's charter

**Status:** in force from S0. **Authority:** the platform's ADR-0002 §2b — every instrument ships
a charter: its declared constraint set, enforced within the instrument as hard errors. This is
the human-readable half; `charter.json` is the data half that `tests/node/charter.test.mjs`
reads and enforces. `sofa` is a codename; the shipped name is `src/brand.ts`, the owner's call.

The Sofa is built on one of the platform's two pillars — **the deck** — and refuses the other.
Every platform invariant binds it unchanged: the audio-thread rules, the sample-rate rule, the
tape block format, the file identity system, the legal boundary, "every DSP algorithm is ours".
On the spools side it is a **fork of purpose**, not a vessel: it has a backend (the needle), so it
lives beside the loom under its own name, consumes `spools` from npm like a stranger, and keeps
the honesty culture whole.

## 1. What the Sofa is

A listening room: one turntable that everyone in the room shares, a crate, a few seats, a
terminal. It is finished when a few friends can put records on and talk over them — never when
it is a small workstation, and never when it is a second syrup.

## 2. Surface grammar

1. **One turntable, shared.** One platter — grab it and the record follows your hand: the platter
   produces a *speed* into the deck's capstan, never a bare position (the head set down is the
   one position it writes). Pitch follows speed, always; there is no time-stretch anywhere.
   The record on it and the **global head** are the room's; each seat also has a **local head**
   and is either **synced** (its deck follows the room, nudged by a few percent, never jumped
   unless the room moved) or **free** (its hand is its own; the room's head is a ghost bead).
2. **Seats.** A device in the room, with a name and a colour. Presence is a heartbeat over the
   spool's awareness — never an entry, gone thirty seconds after the tab.
3. **The crate and the queue.** Records offered to the room: a stream recipe (the link, never the
   file) or a plate. Cues in order are the queue; when a record ends the next plays, and the
   race to say so is settled by the spool's order.
4. **Marks.** A comment pinned to a groove position, timestamped to the record and to the room;
   optionally the last fifteen seconds of a hand, bounded, replayable. A scratch is never
   broadcast unless it is a mark.
5. **The terminal.** Words, while it plays.
6. **The needle.** A private ripper the room's mint names; its cache makes the second seat
   instant. It is yours, it shares nothing, and its token travels with the room's link.

## 3. Refusals

Within the Sofa these are law, not guidance; the registry test fails the build on any of them:

1. **No graph.** Nothing from the graph pillar — no compiler, no voices, no modules beyond the
   deck's fixed chain and the limiter on the export path.
2. **No cables, no nodes,** and no affordance suggesting one exists.
3. **No synthesis, no patches, no sequencing, no modulation, no mixer** — not as features, and
   not as *words* anywhere a user can see.
4. **No time-stretch.** Slower is lower.
5. **No track grid, no timeline editing.** The deck below is multitrack by construction; the
   product never shows it.
6. **No accounts.** A room is a link; the link is the key.
7. **No second turntable.** Two decks and a crossfader are syrup's; a listening room has one stereo.
8. **No scratch broadcast that is not a mark.** A hand on the platter is a seat's own; what the
   room hears of it is what its owner pins.
9. **No presence that outlives the tab.** Ghost presence is a named refusal upstream and here.
10. **No sibling-product reveal.** Nothing in the Sofa mentions or exposes the platform or its
    other instruments. The Sofa opens its own databases (`sofa`, `sofa-plates`).
11. **The legal boundary.** No TE marks; no real person's or label's name in any shipped string.

**On live multiplayer.** The platform's product brief refuses it *for SOFAKIT* — "two cursors on a
four-knob instrument is nonsense; sharing is asynchronous." That is SOFAKIT's charter, not a
platform invariant, and the Sofa answers it on purpose: one shared head plus a local head per
seat is not two cursors on one knob, and what a seat does with its hand stays its own unless it
pins it. The record is shared; the hands are not.

## 4. Enforcement

`tests/node/charter.test.mjs` runs in `npm test` and fails hard, parameterised by `charter.json`:

1. **Import jurisdiction:** the entry points are bundled and every transitive input must fall
   under `allowedImports` and never in `forbiddenImports`. A graph import is a failing build.
2. **Shipped strings:** every string literal in the minified bundles, plus the page and the
   manifest, is scanned for `forbiddenShippedTerms` — the platform, the siblings (`reel`,
   `loom`, `syrup`, `prometheizz`), synthesis vocabulary, TE marks.
3. **Surface grammar:** exactly one platter, no crossfader, no record button.
4. **The brand** is not a sibling's name.

## 5. Honesty commitments

- The link is total, irrevocable power over the room: read, move the record, edit the past.
  Said where a link is shared.
- The relay sees IPs, room codes, sizes and timing, never content. Said in the fine print.
- Presence is a heartbeat; a closed tab is gone in thirty seconds. Said where seats are drawn.
- The needle is yours and shares nothing; its address and token ride sealed inside the room's
  link, so anyone holding the link can use it. Rip only what you have the right to keep. Said
  where a link is pasted.
- An empty room may be a wrong key. Said when the room is empty.
- A record longer than the tape is refused in words, never trimmed to fit.
- Anything the platform has not yet given us (`VENDOR.md`, asks) is shown as pending, not faked.

## 6. Judgment calls (spec-silence records)

1. **The name** (2026-09-07). `sofa` is internal — the repo, the databases, the storage keys,
   the awareness field. The shipped name is one constant. syrup ships the word "sofa" for its
   seats feature (`docs/SOFA.md` D4), so if this product ships as SOFA, syrup cannot forbid
   the word without forbidding its own; that is the owner's call, recorded in `NOTES.md`.
2. **A twenty-five-minute tape** (S0). `DECK.tapeSecs = 1500`: a side of vinyl and a half, on
   T-043 upstream; the map holds 93 minutes at 48 kHz. A longer record is refused in words.
3. **Deck pillar only** (S0). Effects in v0 are the ones a turntable has: speed and pitch
   together, the hand, the brake. A monitor reverb or EQ, if ever, is Web Audio nodes; the
   graph pillar joins by amendment, not by drift.
4. **Recipes, not bytes, for stream records** (owner, 2026-09-07). Every seat resolves a link
   through the room's needle; the house never redistributes anything. Local files keep syrup's
   plate pipeline (preview, then the full file, through the blob route).
5. **Presence on awareness, never entries** (2026-09-07). What goes in the log is what someone
   would want to read a year from now: the mark, the record, the fact it was played at 21:04 —
   not thirty head positions a second.
6. **The head is derived, never stored** (2026-09-07). A `turntable` entry says where the record
   was and when; every seat computes the global head from its own clock. No server clock; late
   joiners converge; a synced seat closes skew by nudging speed, and only seeks when the room
   itself moved.

## 7. Open questions

- The shipped name (§6.1), and whether syrup's charter adds it to its forbidden terms.
- Clock skew: trusted wall clocks in v0, an estimate from presence, a notice above a second;
  correction if a real room asks for it.
- The graph pillar, ever.
- A record longer than the map (an hour-long mix): paging, or "cut it in the crate".
