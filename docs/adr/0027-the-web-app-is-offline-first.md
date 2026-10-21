# The web app is offline-first for everything logically possible

Our audience reaches the site over intermittent, metered connections, so a network round-trip
before anything renders is a usability defect, not a detail. We decided that **every feature that
can logically work without a network must** — the site opens to last-known data instantly, the
account tools accept writes with the radio off, and connectivity is treated as an optional,
asynchronous dependency. Only features whose value is inherently tied to a live server (Media
Downloader, rate refresh, MCP, Admin, sign-in) may require the network, and they must say so
plainly instead of failing.

The bar is a _native-app feel_: instant paint, optimistic writes, and "offline" as a normal state
rather than an error page. This applies to an ordinary browser tab **and** an installed PWA; we do
not gate offline writes behind installation.

## Considered Options

- **Resilient reads only (cache the shell, hard-fail on write).** Rejected: it fixes the crash page
  but not the actual complaint — a user logging a habit or expense on a dropped connection still
  loses the action.
- **Restrict and hard-fail offline (a clear "you are offline" screen).** Rejected: the current
  behaviour, and the thing we are replacing.
- **Gate deep offline on an installed PWA.** Rejected: it puts the best behaviour behind an install
  funnel most visitors never complete.

## Consequences

Every product is now judged against this bar. Server-only surfaces must render an explicit
"needs connection" state rather than a spinner or a thrown error. New features pay an offline cost
in design: if it cannot degrade, it needs a stated reason. The mechanism (Local Store, Outbox,
cache tiers) is fixed by ADR-0028 through ADR-0031.

## Amendment (2026-10-21): a failed pull is the pill's quietest state, not an alarm

The pill (#369) has always spoken for the **write** side: pending count, permanent failures with a
retry, connectivity. A **pull** that fails while the connection is fine — a 500, a proxy, a token
the server rejects — leaves the user reading the Local Store's last successful state with nothing
saying it is not current (`frontend/state/habitflow/use-habit-sync.ts`, `use-spendtrack.ts`,
`use-quran-reader.ts` all log and carry on). We decided the pill gains a read state, as the
**quietest tier it has**.

**The decision:**

- It is a whisper, not an alarm. Red stays reserved for writes: a failed pull never lost a write
  (data authority is the device's, ADR-0028) — the only cost is another device's changes that have
  not arrived yet. The line renders in the pill's informational zinc palette, the palette of
  status, not of loss.
- It speaks only when the pill would otherwise be silent (online, nothing syncing, nothing queued,
  no permanent failure). When a louder statement is true — «غير متَّصل», «بانتظار المزامنة», a failed
  write — that statement already owns the pill and the read line does not compete.
- It names the failure **and** the age of the copy shown: «تعذّر التحديث — تُعرض النسخة المحفوظة،
  آخر تحديث قبل 5 د». Tapping it retries the entire sync, writes and pull in one gesture. Both
  halves are needed: an age alone ("updated 5 minutes ago") would say the same frozen number for an
  offline device and a rejected token, while naming the failure alone would say nothing about how
  old what is on the screen actually is.
- Where the action is attempted. A pull attempt is a sync event of the open page, so the state of a
  failed attempt lives in the same always-visible sync surface, by the same rule ADR-0031's
  amendment recorded: `/offline` answers a document request, never a pull this page just made.

**The number must be honest across a reload.** "Last updated" is the time of the last successful
reconcile with the server, recorded per identity in the Local Store rather than held in component
state — a tab reloaded days after its last good pull must show an age of days, not reset to "now"
because a new hook instance opened. Offline the pill already says so and no pull is attempted, so
the read line only ever describes the connectable case.

## Considered Options (the amendment)

- **A loud third state — red, "could not refresh", retry on tap.** Rejected: red is the write
  failure's colour, and the write failure means risk. Teaching the eye that red also means "maybe
  another device's row" both panics on a stateless event and dulls the alarm that does mean loss.
- **A bare timestamp after a failed pull (#369's option 2).** Rejected as the sole form: the same
  frozen "5 minutes ago" covers "the server refused the token" and "the router died", so the honest
  number reads like a broken clock until the failure is named. The decision keeps the number but
  attaches the cause.
- **Nothing in the pill; a per-surface affordance.** Rejected: once #449's Phase 2 lands, the
  dashboards render from the local stores and the pill is the one always-visible sync surface they
  share. Sending the read state to each surface means re-inventing one question per product, in
  pages that already defer their sync vocabulary to the pill.

## Consequences (the amendment)

`SyncPillStatus` grows additive optional fields (`pullFailed`, `lastPulledAt`), so every existing
product pill keeps compiling and no surface without a server pull changes shape. HabitFlow is
the demonstration surface (#369's acceptance criteria); SpendTrack, LinkSnap and the Quran reader —
whose pulls fail in the same catch — follow with the per-product pill work in #449, so the pill
gains its read state and its queued state in one decision rather than two. The tiering is held by
the pill's unit test: a failed pull with a clean write side renders the read line, and a queued or
failed write suppresses it.
