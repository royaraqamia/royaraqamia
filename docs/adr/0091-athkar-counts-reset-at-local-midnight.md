# Athkar counts reset at local midnight, and never leave the device

`/athkar` is a reading surface with exactly one piece of state: how many times the reader has said
each dhikr today. Four decisions around that state are easy to get wrong in the direction that looks
more helpful.

**1. The day boundary is the device's local midnight, not a prayer window.** Adhkar al-sabah is said
after Fajr and adhkar al-masa after Asr, so "reset after Fajr" reads like the faithful rule. It is
not implementable honestly here: a prayer time needs a location, a calculation convention (the Asr
madhab alone moves the window by an hour), and a per-request source; the site has none of the three,
and a guessed window would wipe a reader's afternoon progress at the wrong moment — or, worse, at the
right moment in one city and the wrong one in the next. Midnight is a boundary the device already
knows, needs no permission, needs no network, and is the same answer offline. The consequence is
accepted: the morning sitting is available from 00:00, and the page opens on it.

**2. The rollover is a comparison, not a timer.** The stored record carries the local calendar day it
belongs to (`YYYY-MM-DD` from local date parts, never `toISOString()`, which is UTC and would roll
over at 15:00 in Damascus). Every read compares that day with today's and returns an empty day when
they differ. A tab left open overnight therefore cannot keep yesterday's ticks even if its timer
never fires; the timer exists only to refresh the view at the boundary, not to make the data correct.

**3. Nothing is synced and nothing needs an account.** The count is a checklist for one sitting, not
a record anyone would miss on another device, and a synced count would buy a schema, RLS, an outbox
and a merge rule for a number that resets in a few hours. It lives in `localStorage` beside the
services-menu order, under `rr:athkar-counts:v1`, and clearing site data is the reset.

**4. The count stops at the number the narration states.** It is the narration's count, not a
suggestion, so counting past it would imply a repetition nobody asked for. A mistap is undone per
card instead of by overwriting a total.

The content itself is vendored, like the Quran's (ADR-0057): `data/athkar/*.json`, validated against
`shared/contracts/athkar.ts` during the read so a malformed entry fails `next build`. Its provenance
and the review it expects are recorded in `data/athkar/README.md`.

One consequence reaches the precache list: a prerendered surface with no server read belongs in
`PRECACHE_ROUTES` (ADR-0071), which the 34-route cap now covers. The alternative was letting the cap
drop the sorted tail, which is public content by construction.
