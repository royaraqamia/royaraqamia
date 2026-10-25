# The Recitation is one button, and an Ayah's number is not its Bookmark

The reader had grown three surfaces where it needed one. The recitation was a card with its own title,
its own size line, a play control and a separate download control; the Ayah's number was a button that
doubled as the Bookmark control, sitting on a row of its own above the text. Each was defensible on its
own and wrong together: a card that pushes the reading column down, a download nobody finds, a number
that is a control only to someone who already knows it is.

This replaces them with one float and one inline tail.

## The decision, in five parts

1. **One control plays the recitation.** A single round play/pause FAB in the corner the app's other
   floats keep clear, with a bare stop circle beside it while sound is playing. No card, no container,
   no label: the icons are the control, and the reader's position in the Surah appears as one small line
   beneath it. The reader's bottom band is reserved so the last Ayah can end above the float rather than
   under it.

2. **Play is also the keep.** Pressing play streams the first Ayah immediately and keeps the Surah on the
   device in the background, through ADR-0081's download, so a reader who never asks for a copy still
   ends up able to listen without a network. A metered connection still asks first, in the line beneath
   the float — ADR-0081's consent now attached to the action that spends the data rather than to a
   control of its own.

3. **The Ayah's number closes its text.** A stroked circle, drawn in CSS, with the number set in Aref
   Ruqaa and centred by its ink rather than by its box: the face sets digits 0.136 em below the middle of
   a 1 em line (1221/244 ascent/descent, ink 720/-15 of 1000), and that offset is what reads as
   "not centred". The circle scales with the text and a three-digit number fits.

4. **The number is not a control.** The Bookmark is a separate bare icon beside it, with no chip behind
   it: outline while unsaved, filled in the site's hero gradient while saved. Its pressed state is still
   painted by the reading session straight from the index (ADR-0056) — only the paint changed.

5. **The number and the mark travel with the last word.** They are wrapped together with it and kept
   unbreakable, so they close the line the text ends on instead of standing alone on a line of their own.

## Considered options

- **Keep the number as the Bookmark control.** Rejected: a number that behaves like a button is a mark
  discovered by accident, and it makes the number awkward to read as the Ayah's own label. A separate
  control says what it does.
- **Keep the card and put a FAB beside it.** Rejected: two recitation surfaces for one action, and the
  card's height is exactly what the float removes.
- **Download first, then play.** Rejected: Al-Baqarah is 57 MB. A first press has to make sound; keeping
  the rest is the part that can take its time.
- **Play silently downloads whatever the connection.** Rejected: ADR-0081 made the meter a consent
  boundary, and this keeps it.
- **Draw the number's circle with the Uthmani face's U+06DD rosette.** Rejected after looking at it: its
  ornamental nubs take the room a three-digit number needs, and the face's glyph, not our text, would
  decide the size.
- **Report a failed keep in a toast.** Rejected: the reader pressed play and is watching the float; the
  sentence belongs there. A keep that fails and is not asked about stays silent instead.

## Consequences

- The Surah's size is no longer stated before the first press: it appears in the metered prompt and,
  after a keep, in the saved line. The cost is stated when the decision to spend data is made.
- `downloadSurahAudio` keeps its `allowMetered` contract; only the caller moved. Its `unavailable` and
  `failed` refusals are silent in the new flow, because the reader asked for sound, not for a copy.
- A failed keep is retried on the next play press; the state machine in the player did not change shape,
  only what it renders.
- The saved mark's gradient is one `<linearGradient>` defined once by the reader and referenced by id
  from `app/quran/quran.css`; a per-Ayah definition would be a `<defs>` in every card.
- The tests pin the new shape: one button in the recitation region, the number inside the Ayah's
  paragraph with the mark beside it, and play keeping the Surah.
