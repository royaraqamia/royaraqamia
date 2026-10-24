# The services menu keeps the order its visitor gives it

The `خدماتنا` sheet is a list of fourteen routes that every visitor sees in the same order. That order
is the business's, not the visitor's: whoever books a consultation twice a week scrolls past eleven
rows to reach it, and whoever checks certificates does the same. Rows can now be dragged into the
order that person wants, and the device remembers it.

Three ways in, because the sheet is opened by three kinds of pointer: a grip at each row's inline end
starts a drag immediately for mouse and touch; a long press on the row itself picks it up on touch, so
the row does not need a thumb-sized target; and `↑`/`↓` (plus `Home`/`End`) on the focused grip moves a
row one slot, which is the only path a keyboard or switch user has.

The memory is `localStorage`, and nothing else. It is one array of hrefs under
`rr:services-order:v1`, it survives a refresh, a new tab and a browser restart on that device, and it
never leaves the browser. Consequences, all deliberate:

- **Device-local, not account-local.** No migration, no API route, no auth requirement — a signed-out
  visitor and the owner get the same feature, and the list still works offline, which matters because
  the sheet is part of the app shell that has to render without a network. The cost is that the order
  does not follow a person to a second device, and clearing site data restores the shipped order.
- **Hrefs, not positions.** A route is what a service _is_; a position only means something against
  the list it was measured in. A service that a release adds, hides or renames therefore degrades to
  "sits where the default puts it" instead of silently shuffling every other row.
- **Nothing is pinned.** The two lead calls to action (build a project, the monthly retainer) can be
  dragged like anything else. Pinning them would say the sheet is a catalogue with a fixed head, and
  the whole point is that a visitor's priorities decide what the head is.
- **No reset control.** A row can be dragged back by hand, and an extra row whose only job is to undo
  a drag is a row in the list it is trying to tidy. Clearing the clearable is the browser's job.
- **The sheet only.** The command palette stays a search over the shipped order and the app drawer
  stays navigation; both are places a visitor arrives at by name, not places they browse for what they
  use most. One saved order, one surface it changes.

The gesture is hand-rolled (pointer events, a frame loop, a `transform` written straight to the loose
row) rather than a sortable library: the navbar chunk is on the critical path, and a library would cost
more bytes than the ~300 lines that implement this. What is measured in the end-to-end test is
therefore the arithmetic of the drag itself — jsdom has no layout, so a unit test can only prove the
pure reorder and the keyboard path, not the pointer crossing a slot.

## Why the drag does not re-order the data it renders from

The list reorders in state as the pointer crosses a slot, and the loose row keeps its own place under
the finger by subtracting its layout position from the pointer's. Layout positions ignore the
transform, so the two never fight: the row floats, the list shuffles beneath it, and the transform is
written to the DOM node rather than through React, which would re-render a dozen links per frame.

## Considered options

- **Store the order in the account.** Rejected for now: it needs a column, a route, a contract and a
  hydration path, and it leaves a signed-out visitor — most of this site's traffic — with a feature
  that does nothing.
- **`@dnd-kit/sortable`.** Rejected: mature, but ~15 KB gzip added to the shell's chunk to sort one
  list of fourteen rows.
- **Native HTML5 drag-and-drop, as `scheduled-calendar.tsx` uses.** Rejected: it does not fire on
  touch, and the sheet is primarily a phone surface, so most of the feature would need a second path
  anyway.
- **Order by usage instead of by hand.** Rejected: it makes the menu move on its own, which reads as
  a bug, and it cannot express "I want this at the top even though I rarely use it".
