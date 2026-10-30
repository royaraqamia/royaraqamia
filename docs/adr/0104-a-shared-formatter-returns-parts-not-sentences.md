# A shared formatter returns parts, not sentences

The connected-apps port hit a wall that every remaining surface will hit. `calculateTimeAgo`
(`frontend/shared/format.ts`) returns a finished sentence — `منذ 5 دقيقة`, `منذ لحظات` — and four
surfaces render it: the notifications bell, the notes list, the note editor and the connected-apps
view. Those words are user-facing strings, and since ADR-0098 a user-facing string lives in a
`shared/copy/*.json` and is generated into both clients. A formatter that builds the sentence itself
cannot be ported without either retyping Arabic into Kotlin (what ADR-0098 forbids) or teaching
`check:parity` an exception for a function (which is how the rule dies).

## The decision

- **A formatter returns a unit and a count**, not a sentence: `timeAgoParts(iso)` answers
  `{ unit: 'now' | 'minutes' | 'hours' | 'days' | 'weeks', count?: number }`.
- **The surface owns the words.** Each component renders its own layer's
  `COPY.timeNow / timeMinutes / …` with `{count}` substituted, exactly as the plan card renders
  `EXPIRES` with `{date}`. A phrase change is a copy change, and `check:copy` fails a stale output on
  both clients.
- **The app mirrors the same function** (`TimeAgo.parts`) and the same substitution, so the two
  clients agree on the thresholds the way `PlanDates` and `hijri-dates.json` agree on the calendar.
  The thresholds are arithmetic, not copy, so they are pinned by a test on each side rather than by a
  shared fixture.
- **A past date beyond four weeks is still a date**: the callback to `formatHijriDate` stays where it
  is, in the surface, because which calendar and which wording a surface shows after a month is the
  surface's business.

## Why not the alternatives

- **Five phrases copied into every surface's copy source.** Four surfaces would carry the same five
  keys, and the fifth surface would get two of them wrong. The duplication is the drift.
- **One `shared/copy/time-ago.json` that `format.ts` imports.** `frontend/shared/format.ts` is a
  formatter, not a surface: it would become a UI module that knows a copy file, and the copy row in
  `parity.json` would name a component that draws nothing.
- **Leave the sentence and exempt the function.** An exemption is for a _file that draws_ without a
  row; exempting a string is exempting the rule.

## Consequences

- `calculateTimeAgo` keeps its signature for the three surfaces not yet ported, and is deleted when
  the last of them moves — the same retirement the plan card's hand-written `UsageCopy` had.
- The connected-apps port is the first consumer: `timeAgoParts` in `format.ts`,
  `TimeAgo.parts` in the app, five keys in `shared/copy/connected-apps.json`.
- A future cross-surface formatter (a file size, a currency) is written the same way: parts out, words
  in the surface's copy source.
