# A view switcher is one chip row

Three patterns were doing the same job. The apps surface drew a segmented box
that split the width into thirds, so the longest label wrapped to two lines. The
admin section navs were three copies of the same `rounded-full` chip row. The
account-posts, notifications and athkar tabs were three more boxes with their
own active colours — including a filled gradient on athkar that read as a
button. A member learns "this thing switches the view" on one screen and meets a
different control on the next.

## The decision

1. **One primitive: `frontend/ui/primitives/tab-chips.tsx`.** `TabChipsNav` for
   a page whose tabs are addresses (`aria-current`), `TabChips` for a sheet or a
   screen whose tabs are state (`role="tablist"`, roving `tabIndex`, arrow keys
   with the RTL direction). Both render the same chip, scroller and badge.
2. **No track behind the chips.** The row is a horizontal scroller
   (`scrollbar-none`, `-mx-1 px-1` so the focus ring is not clipped); chips keep
   `whitespace-nowrap` and `shrink-0`, so a label is never split and the row
   scrolls instead of squeezing each cell.
3. **The active chip is the page's ink.** `bg-foreground text-background`,
   inactive is a hairline border with muted text. The brand violet stays for
   actions: a filled violet tab reads as a button and competes with the real ones
   beside it. This is a dark-first choice — on the light theme it inverts with
   the ink.
4. **Every view switcher uses it.** The apps tabs (page and sheet), the training,
   consultation and clients admin navs, the account-posts filter tabs, the
   notifications tabs and the athkar tabs.

## Considered options

- **Keep the segmented box.** Rejected: the box is what forced the third-width
  cells and the two-line label; a scroll inside a rounded rectangle also clips
  the active chip at the edge.
- **Filled primary.** Rejected by the owner: it competes with the primary buttons
  and with the sign-in panel, and the state is not clearer than a neutral fill.
- **Violet outline.** Rejected: too close to the tinted look that was already
  hard to read at a glance.
- **Unify the filter, status and toggle chips too.** Rejected: those are not view
  switchers. A filter chip can be off, two can be on, a toggle is a switch; one
  look for all of them blurs what the control does.

## Consequences

- **Rates is the one holdout.** Its segmented control is the reference the
  switched-on native rates screen was measured against (ADR-0117, ADR-0118).
  Changing it means changing the Compose control and re-recording the gate, which
  is a paired change of its own, not a side effect of this one.
- The home app strip is not a view switcher: it draws app icons and keeps its own
  control.
- A new view switcher is a caller of the primitive, not a fourth copy. The three
  admin navs are now callers, so a change to the chip lands in one file.
