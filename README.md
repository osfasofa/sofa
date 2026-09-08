# SOFA — a listening room

**`sofa` is the codename**; the name on the page lives in `src/brand.ts` and is the owner's to
settle (spec/01 §0 upstream: a collision search and a trademark pass before anything public).

One shared turntable, a crate of records, a few seats, a terminal. Paste a stream link or
drop a file; the record goes on for everyone in the room with one shared read head; ride your
own head when you want to; leave a mark on the groove with a comment and, if you like, the
last fifteen seconds of your hand on the platter, which the other seats can replay. Every
mark is timestamped to the record's own time and to the room's clock, so every time the
record goes on, its history plays back as a feed. Records are cut into plates and traded.

Built on the deck pillar of the SOFAKIT platform (pinned as a submodule, `VENDOR.md`) and on
`spools` from npm, beside [syrup](https://github.com/osfasofa/syrup), whose spool, plate and
platter modules it lifts as copies. Its own charter (`CHARTER.md`) is enforced by a test, not
by taste. **The plan is `docs/PLAN.md`**; this is S0 of it.

## Run it

```sh
git clone --recurse-submodules <this repo>
cd sofa && npm ci
just dev          # builds the deck's wasm, then vite with isolation headers
just check-all    # typecheck, lint, the node tests including the charter registry test
node tests/browser/skeleton.mjs   # the S0 run in a real browser (tests/browser/README.md)
```

Needs the pinned Rust toolchain (the submodule's `rust-toolchain.toml` installs it on first
`cargo` run), `just`, node ≥ 22, and `binaryen` for release builds.

## What is built

**S0 — the skeleton.** Open the page, drop a record, hear it in under a second, scratch it,
brake it. The turntable boots on a twenty-five-minute tape (T-043 upstream) and refuses a
longer record in words. Nothing leaves the page yet.

Next: **S1** the room (seats, the shared head, synced / free), **S2** the needle (the ripper
service: paste a link), **S3** marks and gestures, **S4** the queue and the plates, **S5** the
finish. `docs/PLAN.md` has each one's acceptance.

## Reserved spool kinds (S1 onwards — planned, not yet wound)

A room is one spool, one link. Any other client rendering the same spool should degrade
sanely on these; the unknown-kind fallback is a protocol right.

| kind | data | meaning |
|---|---|---|
| `mint` | `{device, who, turntable: 'anyone'\|'host', rip?: {url, token}}` | the room's root (first by order wins, never crossed out): who may move the record; the house's needle, sealed inside the spool |
| `record` | `{device, who, name, src: {kind:'stream', url, title?, secs?, by?} \| {kind:'plate', sha256, frames, rate}}` | a record offered to the crate — a recipe or a plate |
| `turntable` | `{device, who, record, action: 'play'\|'stop'\|'seek', t, at, speed, after?, cue?}` | the stereo's state; the newest by order is the truth; `after` names the play an auto-advance follows |
| `cue` | `{device, who, record}` | next up; the live, unspent cues in order are the queue |
| `note` | body, `{device, who}` | the terminal |
| `mark` | body, `{device, who, record, t, at, gesture?}`, parent = the record | a comment pinned to a groove position, with an optional bounded speed curve |
| `take` / `take:wav` / `take:gone` / `rename` | as syrup | plates cut here and traded |

Presence rides `awareness` (field `sofa`): who is here, their mode, their head. Never an entry,
gone thirty seconds after a tab closes.

## Honesty

The link is the room: anyone holding it hears everything, can move the record, and can edit
the past. The relay carries sealed bytes; it sees IPs, room codes, sizes and timing, never
content. Presence is a heartbeat, not a record. The needle is yours: it runs on your box,
keeps a rip for a while, and shares nothing — what travels the room for a stream record is
the link, never the file. Rip only what you have the right to keep. An empty room may be a
wrong key; the room says so. (S0 ships the first sentence's local half: nothing leaves the page.)

## Where things are decided

- `CHARTER.md` + `charter.json` — what the Sofa is and refuses; the registry test reads the JSON.
- `VENDOR.md` — the platform pin, what is imported, the asks the Sofa has of it.
- `docs/PLAN.md` — the design and the increments, S0…S5.
- `TESTING.md` — the torture checklist; rows are marked only when someone watched them pass.
- `NOTES.md` — evidence filed to the loom and to the platform, and the owner's open calls.

Friction found against the `spools` SDK is filed back to the loom as evidence with a
reproduction — never worked around silently, and never ranked above anyone else's report.
Asks of the platform go as tickets plus tiny additive ops with defaults bit-identical.

AGPL-3.0-or-later, like the platform it is built on.
