# The homepage strip is the member's to arrange

[ADR-0146](0146-the-homepage-is-the-app-door.md) made the homepage a door and its
tabs the member's apps, and it chose add order as the only order: "a cap would
turn the last tap into a refusal, and manual reordering adds a gesture for a list
that is rarely longer than four." That held while the strip was new. A member who
now keeps seven or nine apps has one they open every morning and one they check
once a month, and the only way to move the morning app forward is to remove
everything above it and add it back. The strip is the page they land on; its
order is a preference, not an accident of when they tapped «إضافة».

## The decision

1. **The order stays account data, with the device fallback it already had.** No
   column, no route and no contract change: `PUT /api/me/home-services` already
   replaces the whole ordered list, and a guest's list already lives in
   `localStorage`. Reordering is a new caller of the write that exists, not a
   second store.

2. **«ترتيب» is the only way in.** The strip is a horizontal scroller whose pills
   are also tabs, so a free drag competes with two gestures people already make:
   flicking to scroll and tapping to open. A mode costs one tap and keeps the
   strip's normal state exactly as it is — no accidental reorder, a visible
   affordance instead of a secret long press. Inside the mode the picker's «+»
   is hidden, the pills are draggable after 8px of movement, a tap selects the
   tab and leaves the mode, and «تم» leaves it without selecting.

3. **The drag reorders live; the drop is one write.** The pill follows the
   pointer through its own `transform` and the list reorders underneath it as the
   pointer crosses a pill's midpoint. The draft is local, so a drag across four
   slots is one `PUT` of the final list rather than four. The arrow keys move the
   focused pill one slot (`Home`/`End` to the ends), mapped to the strip as drawn:
   in RTL the first tab is the rightmost, so `ArrowLeft` walks toward the end. A
   polite live region names the move and its position, which is the only feedback
   a keyboard user gets.

4. **Writes are serialised, and a refusal rolls back to the last accepted list.**
   Every write is the whole order, so two in flight can land out of order and
   leave the server on the older one — a fast second drop was exactly that race.
   One write at a time, in the order the member made them; a refusal puts back the
   last list the account (or the device) confirmed, not the list before the tap.

5. **The picker stays a picker.** Its rows remain in catalog order, because its
   job is finding an app that is not on the strip yet; a list that reshuffles
   with the strip would push the apps a member never uses to the bottom. New apps
   still land at the end of the strip, which is the one ordering rule left.

6. **The app's strip is the pair, not a later copy.** The composable gains the
   same mode, the same words from `shared/copy/home-strip.json`, and the same
   controller rule (one write at a time, roll back on refusal). It is drawn
   before the home surface is switched on, exactly as the strip was: the surface
   is still the document until `check:visual` passes, and the arrange control is
   part of what will be measured then.

## Why not the alternatives

- **Always draggable.** Cheapest to discover, but a phone strip is a scroll
  surface: a drag that starts on a pill would steal the flick, and a drag that
  starts after a long press is a gesture nobody finds. The mode is one control
  and one tap.
- **Reordering inside the picker sheet.** The sheet already has add/remove on
  every row; a drag there edits a list in a different place from where the member
  sees it, and ADR-0080's retired drag is the precedent for how much surface that
  costs for little gain.
- **A sortable library.** ADR-0080 measured the hand-rolled path at ~300 lines
  against ~15KB gzip in the shell's chunk. The strip is on the door's first
  paint, and the arithmetic here is smaller than the sheet's was.
- **Saving on «تم».** It invents an unsaved state to explain, and closing the
  mode by tapping a tab would silently commit anyway. Every drop is a complete
  truth, so every drop saves.

## Consequences

- The strip has one more control and one more mode. Its width and its raster
  change, so the `home` surface's visual evidence is re-recorded when that
  surface is switched on; the contract's named boxes do not move.
- While arranging, the arrow keys inside the tab list reorder instead of moving
  the selection. The mode is explicit, the help text says so, and leaving it
  restores the tab list's usual keys.
- ADR-0146's "order is add order" is amended: the list is still uncapped and the
  picker still adds at the end, but the order is now the member's to change.
- A refused write costs the member the arrangement they just made, and says so in
  the strip's live region. The same rule already governed add and remove.
