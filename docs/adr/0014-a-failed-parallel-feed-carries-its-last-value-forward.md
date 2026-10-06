# A failed parallel feed carries its last value forward until it goes stale

ADR-0013 says the page must degrade to the official value when a market feed fails. In
practice that is too brittle. Every parallel source is an unversioned third-party page or
community API (ADR-0012), and any one of them can miss a single sync for reasons that clear
by the next one — a throttle, a timeout, a redesign mid-flight. When that happens the
snapshot just written has no value for that currency, so the board silently loses the
parallel figure **and** the official/parallel toggle for hours, even though the previous
snapshot held a perfectly good number. That is the wrong failure mode for a page whose whole
point is the market rate.

We decided that when a sync omits a currency's parallel variant, `buildBoard` falls back to
the **most recent value any snapshot in the last 30 days carried**, keeping its **original
quote date**. The fallback is no longer tied to the immediately preceding snapshot, so a run
of failed scrapes — the normal shape of a blocked source — keeps the market figure on the
page instead of blanking it. Only when nothing in the window carries a value does the
currency degrade to the official rate, so ADR-0013 remains the terminal state. The source
failure still raises the Sentry alert it always did — holding the last value does not hide
that a feed is down, it only stops the outage from emptying the page.

## Considered options

- **Degrade on the first miss (ADR-0013 as written).** Rejected: the parallel rate is the
  reason the page exists, and one flaky fetch should not hide it for a day.
- **Carry the value forward indefinitely.** Rejected: a feed that is truly dead would show a
  frozen price as if live, which is the quiet lie ADR-0011 exists to prevent.
- **Write the carried value into every new snapshot.** Rejected: it would forge synthetic
  points into stored history and `getSeries`, and make a dead feed look like a flat market.
  Carrying at read time leaves the snapshots truthful about what each sync actually fetched.

## Consequences

The parallel variant keeps its own `asOf` — the carried value's original date — and a surface
flags it: when the shown basis is parallel and its value predates the board's provider quote
date, the converter notes the last-update date (`آخر تحديث: …`) so a carried number is never
read as live. `/api/rates/health` lists the codes being held this way under
`staleParallels`. The window is a named option (`parallelLastKnownMs`, default 30 days) so it
can be tuned or pinned in tests. `refresh` and the stored snapshots are untouched; only
`getBoard` carries, so `getSeries` continues to plot exactly what each sync knew.
