# 0130 — A surface stylesheet cannot outrank the shell

Date: 2026-11-05

## Context

Stylesheets are cut by surface (ADR-0113): `app/global.css` is the shell every
route loads, and each surface brings `app/<surface>/app.css`, an independent
Tailwind compilation listing the sources that surface draws.

A route's stylesheet is appended to the document _after_ the shell's, and the two
compilations overlap: both contain the base utilities their sources use
(`hidden`, `flex`, `mt-4`). That overlap is expected and harmless — until one
side compiles a _variant_ the other does not. Utilities are declared in the same
`utilities` layer, so two rules of equal specificity are resolved by document
order, and the surface's later `.hidden` beat the shell's earlier
`@media (max-width: 1023px) { .max-lg\:block { display: block } }`. The element
lost its mobile-only rule.

Measured on `/chats/[id]` at 393 × 852, before the fix:

| Element                 | Computed                                     |
| ----------------------- | -------------------------------------------- |
| the header menu's scrim | `display: none` (`.hidden` won)              |
| the same menu's panel   | `176px` wide (`.w-44`, not `max-lg:w-full`)  |
| its popper wrapper      | `position: fixed`, full width — the rule ran |
| the style rule matched  | `true`                                       |

So the sheet treatment _did_ run; the utilities that make it a sheet were
overridden by the surface's own copy of the base utilities. The same shape of
override explains the drift reported between navigations — every component that
pairs a base utility with a breakpoint variant, on every route whose chunk
happened to load last, until a reload reordered the two.

## Decision

The surface compilation's utilities go into a layer that sits _below_ the
shell's:

```css
/* both entries */
@layer theme, base, components, surface, utilities;
```

- `app/global.css` imports Tailwind unwrapped → its utilities land in
  `utilities`.
- `app/surface.css` imports `tailwindcss` with `layer(surface)` → a surface's
  utilities land in `surface`, which is declared before `utilities`.

Whatever the document order, the shell wins the properties it defines, and a
surface still applies everything the shell does not. The shell is the one
compilation that is guaranteed to contain every class its own components use —
base utility _and_ variant — so it is the correct authority for them.

The shared preamble (tokens, the `dark` variant, the type plugin, the animation
utilities) moves to `app/tailwind.css`, imported by both entries, so the two
compilations still cannot drift apart on anything except the layer name.

## Consequences

- A surface can no longer override a shell utility class by re-declaring it. It
  never needed to: the two compilations emit identical declarations for the same
  class. Overriding a shell _component_ is a stylesheet rule (unlayered or in a
  later layer), which still wins.
- The overlap between the two chunks is unchanged in size; this is an ordering
  fix, not a deduplication.
- `npm run check:tokens` and the visual baseline still pin the generated
  properties, so a token that moves layer by accident fails the gate.
- A component drawn on a surface must still be listed in that surface's
  `@source`s (ADR-0113). Layer order decides contests, not presence.

## Alternatives

- **List `frontend/ui/primitives` in every surface entry.** Fixes the menu and
  nothing else: the next base utility a surface shares with a shell component
  that has a variant reproduces the bug one class over, once per surface.
- **Load the surface chunk before the shell's.** Next decides that order, and it
  is the same order that makes the first paint correct; a fix that depends on
  the bundler's ordering is not a fix.
- **One stylesheet for every route.** Correct by construction, and the cost
  ADR-0113 measured and removed.

## Amendment (2026-11-05)

Reversed the next day by [ADR-0132](0132-a-shell-component-owns-no-base-utility.md),
on measurement. The order decided here fixed the popper scrim and cost every
surface its breakpoint variants: 379 elements lost their `sm:`/`lg:` step, against
29 inside shell components for the opposite order. Moving the surface _above_ the
shell does not work either — `@import 'tailwindcss' layer(surface)` takes
Preflight into that layer, so a surface's `h1 { font-size: inherit }` outranks the
shell's heading utilities (measured on `/quran`: 16px/400 for a title that is
48px/800). Both entries import Tailwind unwrapped and the surface's utilities win
on document order, as they did before this decision. What survives from here is
narrower than a layer — a shell component owns no base utility beside a breakpoint
variant, which is what the scrim actually needed — and `npm run check:layers`
holds it.
