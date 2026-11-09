# The corner controls share one line

On `lg` and up the tab bar floats as a pill 40px above the edge while the corner
FABs rest at 20px, so the three read as a stagger: the pill's centre sits
21–26px above the two controls it is meant to balance. On the reader, the
assistant sat 68px above the play float it shares the band with, because the
generic lift raised every corner float one clearance above the player's top —
including a float in the opposite corner that can never collide. Both are the
same fault: one band with three different lines.

## The decision

- **The pill's centre is the corner line on `lg` and up.** `--roy-corner-rest`
  becomes `calc(2.5rem + 1px + var(--roy-safe-bottom))` wherever the tab bar is
  rendered, so a 56px FAB's centre lands on the 58px pill's centre. The pill
  keeps its 40px offset; the corner controls rise to it.
- **The two corner FABs are 56px.** The assistant's labelled pill gains
  `sm:h-14` and its 44px orb centres inside it. The bar's 58px is its 56px row
  plus a 1px border, so the three share a centre within 1px.
- **The right control mirrors the left.** The assistant's inline-start inset
  becomes 20px (`sm:start-5`), so the orb's centre is 48px from the right edge —
  exactly the left FAB's centre from its edge. The orb's visible edge sits 6px
  inside the pill's, because it is the pill's content, not its boundary.
- **The assistant lands on the reader float's line, not above it.** The float
  publishes its measured bottom (`--roy-player-float-bottom`), and the
  assistant's bottom is `max(corner rest, bar lift, float bottom)`. The
  full-width mini bar still lifts both; the corner float in the opposite corner
  does not.

## Why not the alternatives

- **Drop the pill to the FABs' 20px.** It is the smaller change, but the
  floating pill is a deliberate desktop treatment (the e2e suite pinned it at
  40px), and lowering it puts the primary navigation a thumb's width from the
  gesture area.
- **Align bottom edges rather than centres.** The three are 56, 56 and 58px;
  equal bottoms leave the bar visibly a hair lower and stop being aligned the
  moment one height changes.
- **Keep the assistant above the float.** The two sit in opposite corners and
  cannot collide, so the clearance only produced a 68px stagger that reads as a
  mistake.
- **Hide the assistant on the reader.** It is the product's door on every screen
  (ADR-0143); the corner is free.

## Consequences

- `--roy-assistant-bottom` is the one place the assistant's line is written;
  `--roy-float-rise` still governs the compose FAB and the bottom pills.
- The reader's float publishes two measured tokens — its lift and its bottom —
  and the lift stays for anything that must clear its top.
- `e2e/app-chrome.spec.ts` pins the three centres and the mirrored insets;
  `e2e/quran-audio.spec.ts` pins the reader pair's shared bottom.

## Related

- [ADR-0087](0087-the-corner-floats-clear-the-player.md) — the lift this
  refines.
- [ADR-0143](0143-the-assistant-has-a-door-on-every-screen.md) — the assistant's
  door.
- [ADR-0149](0149-the-app-roots-wear-the-app-chrome.md) — the chrome the pill
  belongs to.
