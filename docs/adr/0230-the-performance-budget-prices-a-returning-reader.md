# 0230. The performance budget prices a returning reader

## Status

Accepted (2026-11-28). Applies ADR-0150 (the panel's returning-reader warm-up) and ADR-0143 (one
door on every screen); extends the post-paint gate in `scripts/perf-runtime-weight.mjs`.

## Context

The assistant's door is mounted once by the root layout, so it is on every screen except `/auth` and
`/chats`. For a browser that has opened نور once, the launcher warms the panel's chunk while the
page is idle, so the next tap opens a conversation that is already parsed (ADR-0150). That chunk is
the composer, the Tiptap editor and the conversation: 184 KB gzip as the audit measured it on an
idle page (#1930), 211 KB on `/` on 2026-11-28.

The population that pays it is the one that uses the product's main selling point, and the gate
built to price exactly this kind of chunk could not see it: `perf-runtime-weight.mjs` opened a bare
context with no storage, so `assistantWasOpened()` was always false and the warm-up never ran in the
gate. `perf/runtime-weight.json` recorded a first visit and called it the route's after-load weight.
A returning member's page cost 29 KB more than the ceiling that was supposed to describe it.

The two obvious shortcuts are both wrong. Raising the default ceiling hides the chunk on every
route and still prices a state no member is in. Deleting the warm-up trades away the thing that
makes a second open feel instant, and the next person to notice the tap waits for a chunk would add
it back. Neither is a budget: the first is a number moved to keep a check green, the second is a
real win given away for a number that would still be fiction.

## Decision

1. **A surface is measured in the states its browser is actually in.** `npm run perf:runtime` runs
   every surface twice: `cold`, in a context with no storage, and `returning`, in a context seeded
   with the artifact's `warmHint` row. Both columns are recorded
   (`coldAfterLoadGzipKb`, `returningAfterLoadGzipKb`, `warmDeltaGzipKb`) and printed by
   `--check`, and the ceiling applies to the heavier one. The warm-up stays a first-visit-versus-
   returning-visit trade-off; what it stops being is a trade-off no number describes.

2. **Seeding the hint is an artifact row, not a branch in the runner.** `warmHint` is top-level and
   inherited by every surface; a route row may override it or set `warmHint: false` where the door
   is not drawn (`/auth`, `/chats`). A surface added to `perf/surfaces.json` is priced in both
   states without editing the script, and the next warm-up anyone adds shows up in the same column.

3. **Ceilings describe the returning column.** The 2026-11-28 run ratcheted the reporter-era rows
   down now that a clean visit fetches no reporter, then raised each row to its returning column
   plus measurement headroom. A route without a row inherits a default sized to a shell with the
   assistant warm-up.

4. **A metered connection pays nothing for the warm-up.** The launcher skips the idle fetch when
   `navigator.connection.saveData` is true or `effectiveType` is `slow-2g`/`2g`
   (`assistant-warm-up.ts`). The panel still opens on one tap; it just no longer arrives before the
   member asked for it. The ledger entry from ADR-0150 stands for the connections that can afford
   it.

5. **The gate prices the store, so the store cannot drift silently.** The storage key in
   `perf/runtime-weight.json` is checked against `ASSISTANT_OPENED_KEY` in a unit test, so renaming
   the hint fails the suite rather than quietly measuring a cold visit twice.

An ADR amendment, not a new gate: the ceiling that the returning reader exceeds is the one already
committed, and the fix is the measurement it was missing.
