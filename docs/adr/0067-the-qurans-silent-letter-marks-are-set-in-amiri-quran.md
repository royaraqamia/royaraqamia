# The Quran's silent-letter marks are set in Amiri Quran

[ADR 0064](0064-the-quran-is-set-in-the-kfgqpc-uthmani-hafs-face.md) set the reader in KFGQPC
Uthmani Hafs v0.18 and asserted that "every code point in the vendored text is mapped by the new
face". Mapped, yes; drawn as itself, no. The face maps `U+06DF` — the small high rounded zero that
marks a silent letter in `كَفَرُوا۟` and `أُو۟لَٰٓئِكَ` — to its ayah-number rosette, `uni0600`:
one em wide, empty, with the dots of an ornament. `U+06E3` and `U+06EB` go to the same glyph. So the
reader printed a full-size ring in the middle of a word, in 3,988 places across 2,240 ayat.

The text is not at fault: the vendored Tanzil string carries the right mark, and the printed mushaf
draws it as a small superscript zero. The face is at fault, and it cannot be edited — its EULA
forbids modification — and the published TTF behind the mirror carries the same mapping. quran.com
serves the identical file and avoids the defect only because its reading view sets the text in
glyph-encoded page fonts rather than in this Unicode-mapped face.

We cut the three code points out of the Uthmani face and cover them with Amiri Quran:

- `kfgqpcHafs` declares a `unicode-range` that excludes `U+06DF`, `U+06E3` and `U+06EB`;
- `amiriQuranMarks` declares a range closed to those three, so it can never set a letter;
- `.font-quran` puts the marks face first, so the mark crosses the seam and the word stays in the
  Uthmani face.

## Considered options

- **Leave the rosette.** Rejected: it is a visible error on the reader's only surface, in a third of
  its ayat, and it touches the text a reader is meant to trust.
- **Edit or rebuild the face.** Rejected: the EULA forbids modification, and both published builds
  carry the same mapping, so there is nothing to rebuild from.
- **Render `U+06DF` as `U+06E0`.** Rejected: this face draws `U+06E0` as the small upright zero and
  would look right, but the reader would then render and copy a code point the text does not contain.
- **Go back to Amiri Quran for the whole text.** Rejected: it gives up the mushaf cut that ADR 0064
  chose, for three marks.
- **Cut the three code points and cover them.** Chosen: one face per letter form, the text untouched,
  and the seam is three code points wide.

## Consequences

- The route ships 45.7 KB more font (Amiri Quran, OFL, `public/fonts/Amiri Quran/` with its
  `OFL.txt` and `SOURCE.txt`). It joins the route's CSS through the Quran layout, so no other route
  pays for it.
- The mark is not anchored to its letter: it is drawn at the pen position, which is where this face's
  own `U+06E0` sits, so it reads correctly in `كَفَرُوا۟` and slightly high in `أُو۟لَٰٓئِكَ`. The
  letter forms around it are unaffected — these marks follow `و` and `ا`, which do not join forward.
- `e2e/quran-marks.spec.ts` measures the mark's advance in the browser and fails if it is wider than
  a fifth of the font size — the rosette is ~0.7em and a missing glyph ~0.5em, so a face swap
  cannot quietly bring the ring back.
- If the Uthmani face is ever replaced, the exclusions and the marks face have to be revisited
  together: the three code points are excluded because _this_ build draws them wrongly, not because
  they are unsettable.
