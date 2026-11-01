# A phone composer gives the keyboard the screen

A note and a post are written in the same place: a dialog that is a full-bleed
surface on a phone. It carried a title row, a `flex-1` rich-text body with a
formatting toolbar above it, a character or word line, and a two-row footer —
publish over cancel. `app/layout.tsx` already declares
`interactive-widget: resizes-content`, so when the keyboard opened the layout
viewport shrank by its height and the whole loss came out of the one row that
had to give: the body. The toolbar stayed, the header stayed, the footer stayed,
and a ~250px field was left for the sentence being typed.

Every platform this was compared against spends that height the other way. X and
Instagram put «نشر» in the header and keep nothing under the text; Medium and
Notion move the formatting tools above the keyboard, where a thumb can reach
them, instead of above the text; nobody keeps a cancel button visible while the
writer is typing.

## The decision

- **The footer leaves while the keyboard is up.** On a phone,
  `[data-slot='dialog-actions']` is hidden for as long as the keyboard is up, and
  returns with its dismissal. The primary action is reachable by closing the
  keyboard (back / done), which is one gesture, against the two rows it costs to
  keep it on screen.
- **The formatting tools sit under the text on a phone**, so the row lands
  directly above the keyboard and the first lines of the note are never pushed
  down by a toolbar. Above `sm` the keyboard is not a factor and the tools stay
  above the text they format — one layout per size, not two layouts everywhere.
- **Reading lines go too**: the character count and the «يُحفظ تلقائيًّا» line are
  under the field, and the keyboard is worth more than they are while typing.
- **A full-bleed dialog ends where the keyboard begins.** Chrome and the Android
  WebView honour `resizes-content`, so `100dvh` is already that height; Safari
  does not, so the covered strip is taken off the top as well.
- **The keyboard is measured, not guessed.** `frontend/ui/shared/keyboard-inset.ts`
  publishes `data-keyboard="open"` and `--roy-keyboard-cover` on `<html>`, and
  `app/global.css` reads them. It is mounted by `DialogContent`, so the baseline
  is the height the dialog opened at — before a field took the focus — and a page
  with no dialog open pays nothing. Two readings are needed because the browsers
  split the shrink between the layout and the visual viewport, and
  `visualViewport` alone cannot tell a keyboard from a layout viewport that
  already shrank for it; `cover` is the strip Safari hides, and is `0` where the
  layout moved instead. Under 140px nothing counts as a keyboard, so a collapsing
  URL bar cannot hide a footer the writer never asked to lose;
  `frontend/ui/shared/__tests__/keyboard-inset.test.tsx` pins each reading, the
  URL bar included.
- **It applies to any phone dialog's footer**, not only the composers: the rule
  lives on the shared `DialogActions` slot, so a sign-in form gets the same
  behaviour without being told about it.

## Why not the alternatives

- **A submit glyph in the header while typing**, the X/Instagram shape: honest,
  but it is a second submit affordance to keep in step with the footer's, and
  the owner chose the dismissal instead.
- **Compressing the footer into one row** above the keyboard: the two buttons are
  ~50px apart from being reachable; a 50px bar under a 250px field is not the
  saving the field needs.
- **Sticky-positioning the toolbar over the scrolling body**: the dialog already
  ends at the keyboard, so the bottom of the editor box _is_ above the keyboard.
  A sticky element would only add a second scroll context.
- **Sizing the dialog from `visualViewport.height` alone**: it shrinks with the
  keyboard on both platforms, but it also shrinks with a pinch-zoom, and read-only
  zoom is an accessibility feature here (`maximumScale: 5`).
- **`navigator.virtualKeyboard.overlaysContent`**: it would make the app own the
  geometry outright, but only Chromium implements it, and the browser is half of
  the surface this fixes.

## Consequences

- The keyboard's arrival reflows a dialog on a phone; nothing outside a dialog
  knows about it, and no route ships the measurement unless a dialog is open.
- A page that hides a footer this way cannot publish while typing, by design. The
  gesture is the keyboard's own dismissal, and it is the one every writer already
  performs.
- The rule is CSS on `[data-slot='dialog-actions']`, so a dialog that wants its
  footer back while typing would have to opt out rather than opt in.
