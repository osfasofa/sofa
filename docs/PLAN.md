# The Sofa — a listening room on the SOFAKIT deck and spools

## Context

The owner wants a shared listening room: paste a stream link or drop a file, a self-hosted
service rips the audio at the best quality it can get, the client puts it on a real turntable
(the SOFAKIT deck), the record plays for everyone in the room with one shared read head, each
seat can also ride its own head, people chat while it plays, and anyone can leave a mark on the
groove with a comment and optionally a recorded gesture (a scratch, a scrub) that other seats
replay. Marks are timestamped to the record's own time and to the room's clock, so every time
the record goes on, its history plays back as a feed. Records get cut into plates and traded the
way syrup already trades takes.

What exploration found (three repos read, `osfasofa/syrup` and `osfasofa/spools` pulled in):

- **syrup** already is a spools-native app on the SOFAKIT deck: rooms, a terminal, presence over
  awareness, plates in a crate, a share pipeline (preview then full file through a Vercel Blob
  presign route), a platter with a real motor model, and a **blessed design doc `docs/SOFA.md`**
  whose D7 says: *a house with only a stereo is a listening room.* This app is that room.
- **sofakit main (`b2caa01`)** has landed every ask syrup filed and never got: **T-035 instant
  PCM import** (`DeckController.importPcm`), **T-034 the hand** (`deck.feel({followTauMs: 10})`,
  4× ceiling), **T-037 strips**, **T-036 immediate shutdown**. syrup is pinned 20 commits back at
  `e5d7f30` and still *prints* records in real time.
- **spools 0.2.1** on npm (syrup and familiar pin 0.1.0; 0.1→0.2 is the breaking lane; `stash.
  remember`/`splice()` are in an unreleased 0.3.0). `spool.awareness` is the sanctioned ephemeral
  channel (≈30 s expiry, sealed on keyed spools, never persisted) and **familiar never used it**;
  it is exactly where a synced head belongs. The relay pockets the *whole* doc, ≤ 8 MiB per
  deposit, so the room's spool must stay small.
- The spools ecosystem rule: an app with a backend is a **fork of purpose** (own repo, own name,
  own charter, npm-only SDK, friction filed back as evidence). syrup already lives that way; the
  Sofa's ripper is a backend. sofakit's product brief refuses live multiplayer **for SOFAKIT
  only** (its charter, not a platform invariant); a sibling instrument declares its own. The
  Sofa's answer, written into its charter: one shared head plus per-seat heads is not two
  cursors on one knob.

## Decisions taken with the owner (2026-09-07)

1. **A new sibling repo `osfasofa/sofa`** beside syrup: sofakit as a pinned submodule at
   `b2caa01`, `spools` from npm, syrup's spool / share / plates / platter modules lifted as
   *copies* (ECOSYSTEM.md: copying a convention keeps it honest). Own `charter.json` + registry
   test, own IndexedDB profile, AGPL-3.0-or-later (sofakit is AGPL, consumed as source).
2. **The ripper ("the needle") is Node 24 + TypeScript** (Hono), spawning `yt-dlp` and `ffmpeg`,
   one Docker image, deployed apart from the site (Railway first; the relay lives there).
3. **A stream record travels as a recipe** (URL + metadata), never the file. Every seat resolves
   it through the room's needle; its cache makes the second seat instant; the house never
   redistributes anything. Local files keep syrup's plate pipeline (preview + full via blob).

Still the owner's call, defaults chosen and flagged: the **shipped brand** (`sofa` is the
codename; syrup already ships the word "sofa" for its seats feature, so the public name gets the
spec/01 §0 collision + trademark pass like every sibling; `src/brand.ts` is the one place it
lives), and whether the **graph pillar** ever joins (default: deck only, like syrup).

## Architecture

### The building, in SOFA.md's words

| word | in the Sofa |
|---|---|
| the house | the static site + `/api/blob` (Vercel), as syrup |
| a door | the link `#spool=…&relay=…&k=…`, never seen by a server |
| the green room | who is here, the terminal, the crate, the queue |
| the stereo (placed gear) | **one** turntable, shared: the record on it and the global head |
| a seat | a device in the room: its own local head, synced or free, a name and a colour |
| the crate | records offered to the room (stream recipes and plates); the queue is drawn from it |
| the needle | the ripper: paste a link, get a lossless file, cached for a while |

### Three clocks

1. **Record time `t`**: frames from the record's start at the record's own rate. Marks, cues and
   the transport all speak it; a seat on a 44.1 k tape and one on 48 k agree (`toTape/toRecord`).
2. **Room time**: wall-clock ms, the writer's clock (`entry.createdAt`; unsettable, ties by id).
3. **Play time**: never stored, always derived. A `turntable` entry says *record R, head at t0,
   at wall time w0, speed s*; every seat computes the global head as `t0 + (now − w0)·s·rate`.
   No server clock; late joiners converge; skew is a second at worst and a synced seat closes it
   with a **nudge** (≤ 2 % varispeed, like beat-matching) instead of a jump.

### Reserved spool kinds (the README table; syrup's kept where they fit)

| kind | data | meaning |
|---|---|---|
| `mint` | `{device, who, turntable: 'anyone'\|'host', rip?: {url, token}}` | the room's root, syrup's idiom (first by order wins, never crossed out): who may move the record; the house's needle, sealed inside the spool |
| `record` | `{device, who, name, src: {kind:'stream', url, title?, secs?, by?} \| {kind:'plate', sha256, frames, rate}}` | a record offered to the crate: a recipe or a plate |
| `turntable` | `{device, who, record: <entry id>, action: 'play'\|'stop'\|'seek', t, at, speed, after?, cue?}` | the stereo's state; the newest by order is the truth; `after` names the play an auto-advance follows (the race resolver); `cue` names the cue it spends |
| `cue` | `{device, who, record: <entry id>}` | next up; live, unspent cues in order are the queue; a `take:gone` child retires one |
| `note` | body, `{device, who}` | the terminal, as syrup |
| `mark` | body, `{device, who, record, t, at, gesture?}`, **`parent` = the record entry** | a comment pinned to a groove position; `record.children` is the free index; `gesture` is a bounded speed curve |
| `take` / `take:wav` / `take:gone` / `rename` | as syrup | plates cut here and traded |

Presence rides `awareness` field `sofa`: `{device, who, mode: 'synced'\|'free', record, t,
speed, held, sentAt}` at ≤ 10 Hz while moving, 1 Hz idle. Never an entry.

### The synced head and the hand

- **Synced** (`room/sync.ts`, pure): each frame compare the deck's `status().pos` with the derived
  global head. Inside 30 ms: speed = global. Inside 2 s: nudge speed by `clamp(err / 1 s, ±2 %)`.
  Beyond 2 s (someone moved the room): seek, then hold 250 ms for the deck to settle. Global
  stopped: stop.
- A **hand on the platter** drops the seat to free for as long as it is held; letting go returns
  it (nudge, or seek if far). Free seats draw the global head as a ghost bead. Other seats' heads
  are ghost beads in `colorOf(device)`.
- **Moving the room** (play / stop / seek-to) is a deliberate act: a `turntable` entry, gated by
  the mint's policy (`mayDrive`). A scratch is never broadcast unless attached to a mark.
- `speed()` while STOPPED does nothing on the deck: `play()` first (syrup's re-roll rule).
  `tick()` runs every frame or takes never close.

### Gestures

A ring buffer keeps the last 15 s of this seat's hand: platter omega at 20 Hz plus the anchor
`t0`, sampled on a 50 ms interval (not rAF; background tabs). `/mark! text` attaches it.
Encoded as delta int16 in base64 (≈ 800 B for 15 s); hard caps 300 samples and 4 KB, refused in
words above. Replay on another seat: free mode, `seek(t0)`, drive `deck.speed()` from the curve
each frame (the 10 ms follower tracks it) and the platter with a new scripted `drive(omega)`
regime, then hand back to synced.

### The needle

- `needle/` in the same repo; Node 24 native TypeScript (`erasableSyntaxOnly`, no build), Hono;
  bearer token (`RIP_TOKEN`, or `RIP_TOKENS` one per room, revocable); CORS allowlist; every
  response carries **`Cross-Origin-Resource-Policy: cross-origin`** (the client is `COEP:
  require-corp`); the token rides only in the `Authorization` header (forces a preflight; answer
  `OPTIONS` with the allowlisted origin, never `*`).
- `POST /v1/rips {url}` → `{id}` (id = sha256 of the canonical URL; cache hit is instant);
  `GET /v1/rips/:id` → status / progress / title / secs / rate / frames / sha256;
  `GET /v1/rips/:id/audio[?format=wav]` (FLAC at the source rate, lossless of what came down;
  Range + ETag); `GET /v1/probe?url=` (title, duration before ripping); `GET /healthz` (open;
  reports queue, cache bytes and the AGPL §13 source link).
- `yt-dlp -f bestaudio/best --no-playlist -x --audio-format flac --audio-quality 0 --print-json
  --newline`; ffprobe for the numbers; disk cache under `<id>/{audio.flac, audio.wav?, info.json}`,
  LRU by bytes then TTL, tmp+rename, one rip at a time, a bounded queue, a max duration.
- Client: `decodeAudioData` on the context pinned to the tape rate (already resampled), WAV
  fallback when FLAC decode throws (WebKit is platform-dependent), then `importPcm`. Instant.

### Sound

Deck pillar only (as syrup): one `DeckController`, `feel({followTauMs: 10, speedMax: 4})`,
track 1 only. "Record effects" in v0 are the ones a turntable has: speed and pitch together, the
hand, the brake. A monitor reverb/EQ as Web Audio nodes is a later ticket.

### Upstream asks to sofakit (syrup-style: a ticket, a tiny additive op, defaults bit-identical)

1. **A longer tape.** `newTapeDoc()` hardcodes `lengthFrames = 360 × sampleRate`
   (`sofakit/src/storage/db.ts:222`); `MAP_MAX_BLOCKS = 4096` (`src/audio/tape-layout.ts:17`)
   caps a tape at ≈ 11.6 min at 48 kHz. Ask: `boot(ctx, profile, {tapeSecs})` up to a raised cap
   (32 768 blocks ≈ 93 min; the map SAB grows 64 KB → 512 KB per track; silent blocks cost no
   disk). This is the one change made in this session's sofakit branch
   (`claude/sofakit-streaming-dubplate-hug801`), filed as T-043 with a PR. Until it lands the
   Sofa refuses a record longer than the tape **in words** before ripping (probe `secs`).
2. Nothing else. Nothing in `familiar` changes.

### Honesty sentences (ship in the UI, in `#fineprint`)

- The link is the room: anyone holding it hears everything, can move the record, and can edit
  the past. There is no lock and no host, only the mint's word.
- The relay carries sealed bytes; it sees IPs, room codes, sizes and timing, never content.
- Presence is a heartbeat, not a record: close the tab and your seat is gone in thirty seconds.
- The needle is yours: it runs on your box, keeps a rip for N hours, and shares nothing. What
  travels the room for a stream record is the link, never the file. Its address and token ride
  sealed inside this room's link, so anyone with the link can use it.
- Rip only what you have the right to keep.
- An empty room may be a wrong key (familiar's lesson); the room says so.

## Repo layout — `osfasofa/sofa`

```
sofa/
  README.md  CHARTER.md  charter.json  VENDOR.md  TESTING.md  NOTES.md  CLAUDE.md  LICENSE
  package.json ("spools": "^0.2.1", yjs, y-protocols, @vercel/blob; dev: vite, esbuild, playwright-core, typescript-eslint)
  tsconfig.json  eslint.config.js  vite.config.ts  vite/sofakit-plugins.ts  vercel.json  Justfile  .gitmodules (vendor/sofakit @ b2caa01)
  index.html            #turntable[data-role=platter] (.disc .counter .meter .status .mode) · #crate · #queue · #seats · #terminal (#say #feed) · #export · #fineprint
  api/blob.ts           syrup's, prefix sofa/
  vendor/sofakit/       the submodule
  src/
    main.ts             boot + wiring (~300 lines): claimPage → makeContext → bootDeck → Session.start → Room → rAF → window.__sofa → pagehide/pageshow
    brand.ts            export const BRAND — the one place the shipped name lives
    spool/{session,links}.ts           LIFT
    share/{pipeline,incoming,preview,upload,sha,intent}.ts   LIFT
    plates/{store,cut,player}.ts       LIFT
    platter/{platter,motor,arm,waveform,rstrip}.ts           LIFT (+ additive changes)
    decks/{boot,profiles}.ts           LIFT (print.ts deleted)
    deck/deckui.ts      NEW  the one-deck UI (platter → deck wiring from syrup's DeckUI)
    deck/land.ts        NEW  decode → (resample) → erase → importPcm; the tape-length refusal
    room/turntable.ts   NEW  pure: Play, truth() with the `after` race rule, globalHead, toTape/toRecord, mayDrive
    room/sync.ts        NEW  pure: the nudge reducer
    room/queue.ts       NEW  pure: cues, spent cues, shouldAdvance
    room/gesture.ts     NEW  pure: Ring, codec, bounds, omegaAt
    room/marks.ts       NEW  pure: marksOf(record), passing, upcoming, grooveMarks
    room/presence.ts    NEW  awareness field 'sofa'; pure throttle plan(); skewEstimate()
    room/mode.ts        NEW  pure: synced/free transitions (hand-on/off, replay)
    room/room.ts        NEW  the conductor: entries → truth → resolver → deck → sync → presence → advance
    needle/{api,client}.ts             NEW  wire types (byte-identical to needle/src/api.ts) + probe/rip/poll/fetch/decode/resolveStream
    records/{model,crate,local,resolve}.ts   NEW  RecordSrc, the shelf (records ∪ plates ∪ ghosts), a dropped file → plate, record → AudioBuffer
    terminal/terminal.ts NEW  chat + verbs (/put /queue /mark /mark! /sync /free /needle /mint /export /name); feed rows note | mark ▶ | record | take
    ui/{who,tickler,noticetape,picker}.ts   LIFT;  ui/seats.ts NEW
  tests/node/           _bundle.mjs helper (esbuild the TS as syrup's motor.test.mjs does); charter, motor, arm (LIFT); turntable, sync, queue, gesture, marks, presence, mode, land, needle-client, api-drift, brand (NEW)
  tests/browser/        README (LIFT, seeds `sofa.name` only, probe `__sofa`); skeleton, room, needle, gesture, queue (one per increment; two contexts on the real relay)
  scripts/tone.mjs      a 6 s stereo test WAV for the suites
  needle/               the ripper (below)
```

## The lift list (syrup → sofa)

Global renames: `syrup.*` localStorage keys → `sofa.*`; awareness field `'syrup'` → `'sofa'`;
blob paths `syrup/…` → `sofa/…`; web lock `'syrup-page'` → `'sofa-page'`; IndexedDB
`syrup-plates` → `sofa-plates`. Re-check every SDK call against `spools/docs/SDK-API.md` (0.2).

| syrup file | reuse verbatim | change |
|---|---|---|
| `src/spool/session.ts` | `deviceId`, `deviceName`, `Session.start`, `fresh`, `link`, `who`, `mint()` (first by order), `onPresence`, `onChange`, `note`, `windTake/windWav/windGone/windRename`, `wavOf/goneOf`, `takeOf`, `incoming()`, `peers()` dedupe | drop `tempo/scene/item/spool/rack` kinds and methods; `windMint(data)` with the new shape; add `KIND_RECORD/TURNTABLE/CUE/MARK` + `windRecord`, `windPlay`, `windCue`, `windMark(record, body, {t, gesture?})` (`parent: record.id`); `feed()` allow-list → take \| note \| record \| mark; `hello()/peers()` move to `room/presence.ts`; add `roomFull`, `onFull`, `onUndecryptable` (0.2) |
| `src/spool/links.ts` | `readMeta/writeMeta/deskLinks/labelLink/forgetLink` | `rememberLink` → `stash.remember` when present, else syrup's mirror, `// delete on spools ^0.3` |
| `src/share/*.ts` | all six files | paths, `'sofa.presign-get'`; drop the two `loadMarks/saveMarks` lines |
| `src/plates/{store,cut,player}.ts` | all | `DB = 'sofa-plates'`; `tape-marks.ts` and `crate.ts` not lifted (replaced by `records/`) |
| `src/platter/platter.ts` | everything (`Platter`, `Groove`, `GrooveMark`, `handOn/handRate/handOff/turn/fling`) | additive: `Groove.ghost?: number` (a faint bead), `GrooveMark.kind` gains `'mark'` + `color?`, and `drive(omega \| null)` as a fourth regime in `tick()` beside held / script / motor, cancelled by a hand |
| `src/platter/{motor,arm,waveform,rstrip}.ts` + node tests | all | none (`rstrip` arrives in S4) |
| `src/decks/boot.ts`, `profiles.ts` | `makeContext`, `bootDeck(ctx, profile, into)`, `releaseDeck`, `claimPage` | `into` = a master `GainNode`; `DECK = {name: 'sofa'}` |
| `src/decks/print.ts` | — | **deleted**; `deck/land.ts` replaces it |
| `src/main.ts` | only `DeckUI`'s `onSpeed/onEngage/onRest` bodies (lines 332–357), the `frame()` re-roll rule (1385–1392) and the `setGroove` call (1411–1421) | everything else stays in syrup |
| `index.html` | the deck card markup and its CSS block only | — |
| `vite.config.ts`, `vite/sofakit-plugins.ts`, `vercel.json`, `api/blob.ts`, `Justfile`, `tests/node/charter.test.mjs`, `tests/browser/README.md` | all | Justfile: drop `bank`, add `needle-dev/needle-test/needle-build`; charter test: `platter === 1`, `crossfader === 0`, `record === 0`, `external += 'y-protocols'`, a `brand ∉ brandMustNotBe` test; charter terms += `syrup`, `prometheizz`, `loom` |

## New modules (pure cores first, so node tests need no browser)

```ts
// room/turntable.ts
interface Play { device; who?; record: string; action: 'play'|'stop'|'seek'; t: number /* record frames */; at: number /* wall ms */; speed: number; after?: string; cue?: string }
playOf(e): Play | null                         // validates; NaN/negative → null
truth(entries): EntryLike | null               // newest `turntable` that is not a losing duplicate (an entry with `after` X loses if an earlier one has `after` X)
globalHead(p, nowMs, rate, frames): { t; speed; rolling; ended }
toTape(tRecord, recRate, tapeRate); toRecord(pos, recRate, tapeRate); mayDrive(mint, device); makePlay(base, nowMs)

// room/sync.ts
DEFAULT_SYNC = { deadbandSecs: 0.03, maxNudge: 0.02, horizonSecs: 1.0, seekBeyondSecs: 2.0, settleMs: 250 }
step(state, localSecs, localRolling, global: {secs, speed, rolling}, nowMs, p): { cmd: {kind:'speed'} | {kind:'seek'} | {kind:'stop'} | null; state }

// room/queue.ts
cues(entries): Cue[]                           // live, not gone, not spent (no `turntable` with data.cue === id)
shouldAdvance(entries, current, nowMs, rate, frames, device): { play } | null   // ended && cues non-empty && no `turntable` with after === current.id

// room/gesture.ts
GESTURE_RATE = 20; GESTURE_MAX_SAMPLES = 300; GESTURE_MAX_BYTES = 4096
class Ring { push(omega, t); snapshot(): { omegas, t0 } | null; clear() }
encodeGesture(omegas, t0): Gesture; decodeGesture(g); isGesture(x); omegaAt(d, secs)

// room/marks.ts
marksOf(record, rate): Mark[]; passing(marks, headSecs, window = 4); upcoming(marks, headSecs, 30); grooveMarks(marks, frames, colorOf)

// room/presence.ts
plan(prev, next, nowMs, lastSentMs): 'now'|'later'|'skip'   // mode/held/record change → now; moving → ≤10 Hz; idle → 1 Hz
skewEstimate(seats, nowMs): number | null                   // median(sentAt − now)
class Presence { hello(); set(patch); seats(); onChange(cb); flush() }

// room/mode.ts
next(mode, wasSynced, ev: 'hand-on'|'hand-off'|'sync'|'free'|'replay-start'|'replay-end')

// deck/land.ts
fits(frames, tapeFrames, rate): { ok } | { ok: false; why }   // "this record runs 7:12; the tape holds 6:00"
resample(buffer, rate); landPcm(deck, buffer, label)          // stop → await STOPPED → erase → setLoop off → importPcm(0, 0, {l, r}, rate) → seek(0)

// deck/deckui.ts
class DeckUI { boot(profile); land(id, name, buffer); head(); play(); stop(); seek(pos); speed(r); drive(omega); setGhost(u); setMarks(m); frame(nowMs) }
  // ev: onHand(held), onSeek(u), onOmega(omega, pos) — the ring's feed on a 50 ms interval

// needle/client.ts
probe(cfg, url); rip(cfg, url); nextPollMs(info, attempt); poll(cfg, id, onInfo); fetchAudio(cfg, id, 'flac'|'wav')
decodeWithFallback(ctx, cfg, id, info); resolveStream(cfg, ctx, url, onState); needleFromMint(mint); needleLocal()

// records/resolve.ts
class Resolver { buffer(rec): Promise<AudioBuffer>; state(key); onChange(cb) }   // stream → needle; plate → IDB or Incoming 'full'
```

`room/room.ts` is the conductor, thin and probed through `__sofa`: per frame `deck.frame` →
`truth(entries)` → land a new record once → synced: `sync.step` → apply (play first if parked) ·
free: ghost bead → `presence.set` → `shouldAdvance` → `windPlay` → `terminal.passing(marks)`.

## The needle — `needle/`

```
needle/
  package.json (hono, @hono/node-server; test: node --test)  tsconfig.json (erasableSyntaxOnly)  Dockerfile (node:24-bookworm-slim + ffmpeg + pinned yt-dlp binary, sha256-checked; USER node; VOLUME /data)  railway.toml  README.md  .env.example
  src/api.ts      wire types, mirrored byte-for-byte into src/needle/api.ts (a drift test)
  src/config.ts   env → Config: RIP_TOKEN(S), RIP_CACHE_DIR, RIP_CACHE_BYTES (20 GiB), RIP_TTL_HOURS (168), RIP_ORIGINS, RIP_CONCURRENCY (1), RIP_MAX_SECS (1200), RIP_QUEUE_MAX (8); refuses to start without a token
  src/server.ts   Hono: cors allowlist, bearer auth, CORP on every response, the five routes, Range + ETag
  src/canon.ts    canonicalUrl (host lowercase, drop fragment/utm/si/t, youtu.be → watch?v=), ripId = sha256
  src/ytdlp.ts    spawn: probe (--dump-single-json --skip-download) and download (progress lines, timeout, stderr tail)
  src/ffmpeg.ts   ffprobe → {rate, channels, secs, frames}; toWav (int16; pcm_s24le for 24-bit sources)
  src/cache.ts    disk LRU, tmp+rename, index rebuilt at boot
  src/rip.ts      Ripper: submit → dedupe → queue → probe → refuse too long → download → ffprobe → cache
  test/fixtures/fake-yt-dlp.sh   prints progress, then renders a 3 s sine with the real ffmpeg (or fails when the URL says `fail`)
  test/{canon,cache,rip,server}.test.mjs   + live.smoke.mjs (opt-in NEEDLE_LIVE=1, one public-domain archive.org direct URL — not YouTube: its terms, bot walls and extractor churn make an automated run flaky and a CI IP blockable; a direct URL exercises the same spawn → ffmpeg → cache → serve path)
```

## Increments

Definition of done for each: `just check-all` green (tsc, eslint, node tests incl. the charter
test); `just needle-test` where the needle changed; the increment's Playwright suite green on dev
and staging; `just stage` deployed; TESTING.md rows marked from a watched run; a commit.

**S0 — the skeleton (1 session).** The owner creates the empty `osfasofa/sofa` repo (this
session cannot); scaffold, submodule at `b2caa01`, `spools@^0.2.1`, vite + COI, charter + test,
`DECK` profile, `boot.ts`, `land.ts`, `deckui.ts`, the platter lift, `main.ts` with `__sofa`,
the Vercel project + staging alias, `api/blob.ts` attached. *Ships:* open the page, drop a WAV,
hear it in under a second, scratch it, brake it. *Acceptance:* `__sofa.head().rolling` after
`platter.fling(1)`; a 7-minute file refused with the sentence. In sofakit, the same session
files T-043 (tape length) on the designated branch with its PR.

**S1 — the room (1–2 sessions).** `session.ts` with the new kinds, `presence.ts`, `seats.ts`,
the terminal, `/mint anyone|host` at birth (sessionStorage `sofa.mint.v1` as syrup), `records/*`
for plates, `local.ts` + the pipeline, `turntable.ts`, `sync.ts`, `mode.ts`, `room.ts`, the
ghost bead, honesty lines incl. `roomFull`, `undecryptable` and the wrong-key caveat. *Ships:*
two seats on one link, one record, one shared head, synced / free. *Acceptance:* A drops a file,
B has it; A plays; B's head is within 30 ms of `globalHead` after 5 s; B grabs → free + ghost
bead; releases → synced within 5 s; a `__sofa.skew(ms)` test hook on A makes B seek once, then
hold. *Tests:* turntable (truth, duplicates, equal `createdAt`), sync (every rule), presence
`plan`, mode; `browser/room.mjs` (two contexts, real relay).

**S2 — the needle (1–2 sessions).** The service, its tests, Docker, Railway; `needle/client.ts`;
`/needle <base> <token>` (host) → carried in the mint; the stream branch of `resolve.ts`; crate
state lines ("ripping 42 %", "converting", "already here"); FLAC → WAV fallback; the too-long
refusal before the rip. *Acceptance:* paste a URL on A; both seats show progress, then play
synced; the same URL again is ready in under 2 s; killing the needle mid-rip fails in words, not
a hang. *Tests:* all needle tests; `api-drift`; `needle-client` (`nextPollMs`, error mapping);
`browser/needle.mjs` against a local needle with the fake yt-dlp.

**S3 — marks and gestures (1–2 sessions).** `gesture.ts`, `marks.ts`, the `Ring` fed from
`DeckUI`, `/mark <text>` and `/mark! <text>`, marks as `record.children`, the passing feed, dots
on the groove, `platter.drive()`, replay (free → seek(t0) → per-frame speed + drive → re-sync).
*Acceptance:* A scratches and `/mark! nice`; B sees the row within a beat, taps ▶, B's platter
performs the hand and the sound follows, B returns to synced; a gesture over the cap is refused
loudly (test hook). *Tests:* gesture round-trip, bounds, `omegaAt`; marks projection;
`browser/gesture.mjs`.

**S4 — the queue and the plates (1 session).** `queue.ts`, `/queue <n>` + a queue card,
auto-advance, `rstrip.ts` for in/out, `/cut` → `cutPlate` → pipeline → ghost → preview → full →
`PlatePlayer` audition → put a plate on the table. *Acceptance:* three cues play through on two
online seats with one winning `turntable` per advance (duplicates allowed, `truth()` agrees on
both); a plate cut on A becomes ghost → preview → full on B. *Tests:* queue (spent, race, no
advance while a newer `after` exists); `browser/queue.mjs`.

**S5 — the finish (1 session).** Export button (`spool.export()` → download), a room-size
counter (`Y.encodeStateAsUpdate(spool.doc).byteLength` vs 8 MiB, warn at 6), the clock-skew
notice, every honesty sentence in `#fineprint`, README kinds table final, TESTING.md rows run on
two real devices (phone + laptop), NOTES.md evidence filed (loom: a second claimant for
`depositError: 'paced'`; sofakit: the tape-length ask), the brand plumbed through `src/brand.ts`,
staged; prod on the owner's word.

S0–S2 is the honest v0 (a listening room with a needle). S3–S5 are payoffs. syrup's UX-008–011
stay open and untouched; the Sofa's kinds are written so syrup's green room can render them
later as prose, never as a code dependency.

## Verification

- **Unit (node, no browser):** `node --test tests/node/` — the pure cores (turntable truth and
  duplicate rule, `globalHead` at both tape rates, every `sync.step` row incl. the settle window,
  queue spend/race, gesture codec round-trip and caps, `presence.plan` cadence, `fits`), the
  charter registry test (imports, shipped strings incl. `syrup`/`prometheizz`/`loom`/`sofakit`,
  surface grammar 1 platter / 0 crossfaders / 0 record buttons, brand not in `brandMustNotBe`),
  the `api.ts` drift test.
- **Needle:** `cd needle && npm test` with the fake yt-dlp and real ffmpeg: canon, cache atomicity
  + LRU + TTL, rip states and dedupe, 401 / preflight / CORP-on-every-response / Range / ETag /
  WAV fallback; `NEEDLE_LIVE=1` smoke against one public-domain direct URL, by hand.
- **Browser (Playwright, two contexts on the real relay, as syrup's `tests/browser/`):** one suite
  per increment, asserting through `window.__sofa` (`head()`, `mode()`, `seats()`, `frame(now)`
  driven by hand in hidden tabs).
- **By ear, on staging, two real devices:** phone + laptop on one link; the same record; count
  the beat between them; grab, scratch, release, hear it come back; leave a mark with a gesture
  and replay it on the other device; close a tab and watch the seat fade in thirty seconds;
  reopen the link cold hours later and see the marks come back with the record.
- **TESTING.md torture rows** (familiar's format): multi-device, offline / reunion convergence,
  midnight (the pocket), refresh, wrong key, the needle down, the auto-advance race, a record at
  the tape's limit, the 8 MiB counter.

## Risks and defaults

1. **Clock skew.** Trust wall clocks in v0 (phones are NTP'd within ~100 ms); estimate skew from
   presence `sentAt` and say "your clock is N s off this room" above 1 s. Correction, if wanted,
   goes in `room.ts` only; `turntable.ts` stays pure.
2. **Same-millisecond `turntable` winds.** Deterministic on every replica (ties by id); the
   `after` rule handles the machine tie; losers are never crossed out.
3. **Awareness rate.** 10 Hz × ~150 B is far under the relay's guards; the real cost is receivers
   decoding N seats × 10 Hz, so `plan()` throttles and seats render at ≤ 10 Hz.
4. **8 MiB pocket vs marks.** A gesture mark ≈ 1 KB; hard cap 4 KB; a room counter; "start a
   fresh room" once `splice()` ships in 0.3.
5. **FLAC in WebKit's `decodeAudioData`.** Try FLAC, fall back to WAV, remember per device.
6. **Tape length.** Refuse > 6:00 before ripping until T-043 lands upstream; no paging in v0.
7. **Autoplay.** `resume()` on the first pointerdown + a "tap to listen" notice; the first sync
   after resume is a seek.
8. **The needle token in the mint.** Anyone with the link can rip through the host's needle;
   said in the UI; `RIP_TOKENS` one per room, header-only, never logged.
9. **The name.** `sofa` stays internal; the shipped brand is the owner's, checked by the charter
   test and the spec/01 §0 pass; the charter's substring scan means picking words carefully.
10. **AGPL and the needle.** §13: `/healthz` and the page footer link the source; ffmpeg and
    yt-dlp are spawned, not linked. The needle is the owner's private instance, not a service.
11. **spools version.** `^0.2.1` with feature detection for `stash.remember`; bump to `^0.3.0`
    when published and delete the mirror (a test fails when both exist).
