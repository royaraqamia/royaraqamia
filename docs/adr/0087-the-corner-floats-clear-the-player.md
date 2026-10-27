# The corner floats clear the player

The Recitation's mini player is the bottom-most surface on any page it appears on: a bar across
the bottom of every page that is not the carried sura's own reader, and a float in the corner of
that reader. The corner floats are painted above it — `z-index: 9998` against the player's `40` —
so the compose FAB sat on the mini bar's left end (and the go-up control, since withdrawn by #633, on
its right), both on top of the very controls the bar exists to offer. The report that opened this is
the FAB half-swallowing سورة آل عمران's play button.

## The decision, in four parts

1. **The player publishes its own reach.** Each player measures itself and writes
   `--roy-player-<name>-lift` on `<html>`: how far its top edge is above the viewport's bottom edge,
   plus the clearance every floating surface keeps. Measured, not declared — the bar's height is its
   content's, the reader's float gains and loses a line as the status changes, and a number written
   into the stylesheet would be a second copy of both that drifts from what it describes.

2. **Everything above a corner rises by the same distance.** `--roy-float-rise` is the lift minus the
   corner's resting place. The corner floats land exactly one clearance above the player; the two
   bottom-centre pills (offline, update) rise by that same distance rather than to the same line, so
   the stagger they keep above the corner floats survives the lift.

3. **Only while the player exists.** The property is published while a player is mounted and removed
   when it unmounts, so with nothing playing the rise is `0` and every float is where it always was.
   The clearances are not conditional on the route, the sura, or the playback state — only on there
   being a player on the page.

4. **The move is a transition on `bottom`.** The FAB's `transform` already carries its entrance and
   hover scale, so a `translateY` would fight it; these are `position: fixed` surfaces, so animating
   `bottom` lays out nothing but themselves. `prefers-reduced-motion` drops the duration to nothing
   through the global rule.

## Considered options

- **A breakpoint-by-breakpoint constant in CSS.** Rejected: the mini bar sits at one offset above the
  tab bar and another on a secondary page, its height is its content's, and the reader's float is a
  column that grows a status line at a time. Reproducing that in the stylesheet is a guess that the
  player would silently stop matching.
- **Moving the player up instead.** Rejected: the bottom edge is the bar's place, and lifting it to
  make room for a corner control would only move the collision onto the page content.
- **Hiding the floats while a recitation plays.** Rejected: publishing a post is not less useful
  because something is playing, and a control that disappears is a worse answer than one that moves.
- **Lifting to the same line for everything.** Rejected: the offline pill already sits a line above the
  corner floats, and the update prompt a line above that, so they can be on screen together. Putting
  all three on one line trades a covered player for two covered pills.

## Consequences

- `--roy-corner-rest` is now the one place a corner float's resting place is written; the tab bar and
  the phone rules move it, and no rule moves the floats themselves.
- The lift is published after the player mounts, so a page that loads with a recitation already
  carried lifts its floats a frame later, visibly, rather than in the initial paint. That is the
  choreography the FAB's own entrance already had.
- The surah reader has no corner FAB, but its float and the bottom pills share the band: the same
  property lifts them, so the reader is covered by the same decision rather than by a second rule.
- `e2e/quran-audio.spec.ts` pins the clearance in both states — 12px above the mini bar while it is
  there, 12px above the tab bar once the recitation stops — through the boxes the browser lays out,
  not through the property's value.
