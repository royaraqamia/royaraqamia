# A shadow is a recipe value, or a recorded difference

Three shadows stood between the app and the site's card: `shadow-inner` on the guest prompt's circle, the
badge's `shadow-xs`, and the sign-in pill's purple bloom. Material has one shadow function — elevation —
and a CSS shadow is not it.

## The decision

- **A shadow a ported component draws is a recipe value.** `guestMark.shadow` carries the inset flag, the
  offset, the blur and the colour; the site renders it as `box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.05)`
  and the app draws it as a clipped vertical gradient over the shape's top edge — same colour, same
  offset, same distance, as a wash rather than a CSS blur (`royInsetShadow`). At a 5% alpha the two are
  indistinguishable; neither client gets a number the other does not have.
- **A shadow no ported component draws is not ported.** The badge's `shadow-xs` belongs to the `default`
  and `glow` tones, and the plan card draws `success` and `neutral`. It stays in `badge.tsx` with the
  palette classes those tones already carry, and the recipe has no entry to go stale.
- **A colour a shadow needs may be raw.** Shadow colours are black (or the pill's purple) at a low alpha,
  and the palette has no black to name. `colorValue` accepts `{ "raw": "#000000", "alpha": 0.05 }` for
  that case only, so a shadow cannot become a back door for palette colours.
- **A web-only surface is an exception, listed.** The sign-in pill's hover sheen is a pointer affordance
  and stays on the web; the pill's static appearance (gradient stops, radius, size, border, shadow) is
  the next recipe primitive, and until it exists the app's sign-in action is the app's own button —
  written down in `two-clients.md` rather than implied.

## Consequences

- **`PlanCard.kt`'s guest prompt reads `Recipes.GuestMark`** — size, radius, surface, content colour,
  border, shadow — and no longer carries `56.dp`, a `CircleShape` or a `muted/0.6` literal.
- **`Shadow.kt` exists in the app's theme**, because Compose has no inset shadow and a card should not
  learn how to draw one.
- **The exception list is now four lines** (status bar, keyboard, scroll physics, ripple/selection) plus
  the pill's sheen — everything else in a ported component is a recipe value on both sides.
