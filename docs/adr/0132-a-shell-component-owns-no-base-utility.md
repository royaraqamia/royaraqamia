# 0132 — A shell component never pairs a base utility with a breakpoint variant

Date: 2026-11-05

Reverses [ADR-0130](0130-a-surface-stylesheet-cannot-outrank-the-shell.md), a day
later, on measurement.

## Context

Stylesheets are cut by surface (ADR-0113): one Tailwind build for the shell
(`app/global.css`), one per surface (`app/<surface>/app.css`). The two overlap —
an element can carry a class compiled by one and a class compiled by the other —
and ADR-0130 resolved that overlap with a layer: the surface's utilities went
into a `surface` layer declared below `utilities`, so the shell would win.

That fixed the popper scrim and broke the surfaces. Once the shell outranks a
surface, a surface's breakpoint variant loses to whichever base utility the shell
happens to emit, and the shell emits almost every base utility. Compiled and
compared over both trees:

| Order               | Elements that lose their breakpoint rule |
| ------------------- | ---------------------------------------- |
| shell above surface | 379, spread over every surface           |
| surface above shell | 29, all inside shell components          |

The 379 are ordinary component code — `pt-5 sm:pt-6`, `text-sm md:text-base`,
`hidden lg:flex` — and they lost their desktop step on the routes that render
them. The members rail on `/community`, the Services and Testimonials arrows and
all three composer dialogs were the visible ones.

Ordering the surface _above_ the shell looks like the answer and is not: the
import that puts a compilation into a layer is
`@import 'tailwindcss' layer(surface)`, and the wrapper takes Tailwind's
**Preflight** with it. With `surface` above `utilities`, a surface's Preflight
(`h1, h2, h3 { font-size: inherit }`) outranks every heading utility the shell
ships, and `/quran` measured its title at 16px/400 instead of 48px/800 the moment
the layer was moved. A layer cannot hold one side's utilities without also
holding its reset.

## Decision

**No layer separates the two compilations.** Both import Tailwind unwrapped
(`@import 'tailwindcss' source(none)`), so both put their utilities in the same
`utilities` layer and their resets in the same `base`. A route's stylesheet is
appended to the document after the shell's, so a surface wins the classes it
shares with the shell — which is the correct authority for a surface's own
components, and the arrangement the app shipped before ADR-0130.

**And a shell component owns no base utility beside a breakpoint variant.** The
mirror-image failure — a surface's base class stripping the shell's `sm:`/`lg:`
step — is the shape the layer order cannot fix, so it is banned in code instead.
The base is written as the opposite variant:

```diff
- 'pt-5 sm:pt-6'
+ 'max-sm:pt-5 sm:pt-6'
```

A contest is per _element_, while a layer is global; whatever the order between
two builds, one direction loses. So the order follows where the code is (surfaces
pair base utilities with variants on nearly every element), and the side that
loses is kept out of the contest by a rule a machine can check.

Three shapes follow:

- `max-lg:block` + `lg:hidden`, never `hidden` + `max-lg:block` — the scrim that
  ADR-0130 was written for is fixed by the rule, not by the order.
- A primitive whose property a caller must change takes a prop, not a `className`
  the caller expects to win: `DialogContent`'s `phone="sheet"` carries the sheet's
  display, height, radius and width so the whole class list is compiled together
  (the three composers had silently lost all four).
- Where a font size carried a `leading-*`, the ratio goes into each size utility
  (`sm:text-lg/[1.375]`), because Tailwind v4's `leading-*` sets the `--tw-leading`
  variable every size utility reads — so it cannot simply be dropped.

## Consequences

- A surface keeps its own responsive code working, which is where almost all of
  it is.
- `npm run check:layers` compiles the shell and every surface, then fails a shell
  component that breaks the rule, naming the file, the line and the pair. It reads
  class lists kept in a constant (`const SIZE = { section: '…' }`) as well as a
  `className=`, ignores comments, and only reports a pair when a surface that can
  actually draw the component is missing the variant. One Tailwind compile per
  entry, about five seconds, no build.
- The order the app depends on is document order, which Next owns (the route's
  chunk after the shell's). It is the same order that makes first paint correct,
  and it has not moved; what ADR-0130 removed was the _drift between
  navigations_, and a surviving rule plus a gate is what keeps this one honest.
- The visual baseline is unchanged by the reversal: `/quran`'s title is 48px/60px
  both before and after, and the recorded tokens do not move.
- State variants (`hover:`, `focus-visible:`, `dark:`) are not covered by the rule
  or the check: a state variant is meant to be beaten by a base declaration in
  some cases and the check cannot tell which.
- Payload is unchanged: this decides ordering, not what either chunk contains.

## Alternatives

- **Keep ADR-0130's order and rewrite the 379 surface pairs** as variant-only
  classes. It works, and it makes every surface file read `max-sm:pt-5 sm:pt-6`
  from now on, forever, with no gate able to see a violation a developer did not
  already think about. The shell's 29 are a one-time fix by comparison.
- **One stylesheet for the whole app.** Correct by construction; spends the
  `cssRawKb` budget #497 measured and `docs/performance.md` holds. Rejected on
  cost, not on principle.
- **Compile every surface as a superset of the shell.** Every element's classes
  would then resolve inside one sheet, in canonical order — the only arrangement
  that removes the class of bug rather than containing it. It duplicates the shell
  into every route's chunk (about 266 KB raw), which is the same cost as the
  alternative above.
