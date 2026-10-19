# The Quran is set in the KFGQPC Uthmani Hafs face

The reader was set in Amiri Quran because [ADR 0057](0057-quran-content-is-vendored-under-a-readable-licence.md)
rejected KFGQPC's glyph-encoded Uthmani **text**: its terms were unreachable, and a readable licence
governs every asset. That rule still holds. What changed is the evidence: the font is not the text,
and its own `name` table carries an EULA — "Permission is hereby granted, Free of Cost, to any person
obtaining a copy of this Font accompanying this license, the rights to Use, Copy, Distribute" — with
two limits that matter here: it cannot be sold, and it cannot be modified.

The face itself is the one the Madinah Mushaf is printed in, which is what a reader expects a mushaf
to look like. Amiri Quran is a fine Uthmani face, but it reads as a book face rather than as the
mushaf. So:

- the reader's `--font-quran` is KFGQPC Uthmani Hafs, Version 0.18, vendored unmodified at
  `public/fonts/KFGQPC HAFS Uthmanic Script/` with its `EULA.txt` and `SOURCE.txt` beside it;
- Amiri Quran is removed rather than kept as a fallback: one face per role, and every code point in
  the vendored text is mapped by the new face;
- the fallback is the site's Arabic sans, `--font-arabic`, for anything the face does not cover.

## Considered Options

- **KFGQPC Uthman Taha Naskh.** Rejected: it is a plain Naskh, not the Uthmani cut; it would set the
  text in a face that is not the Mushaf's.
- **An OFL Naskh/Uthmani alternative.** Rejected: a clean licence is necessary but not sufficient —
  it is not the reference face, and the point of the change is the Mushaf's own cut.
- **Keep Amiri Quran as a fallback.** Rejected: the two faces have different metrics, and carrying a
  second face (and its licence) to cover glyphs the Arabic sans already covers is not a fallback.
- **Keep Amiri as the reader's face.** Rejected: it was chosen by the licence rule, not on
  typography; the KFGQPC font's own EULA satisfies the rule.

## Consequences

- The route ships 87.7 KB of font instead of 45.7 KB. It is registered in the Quran layout, so it
  stays inside that route's CSS and the landing page's font budget is untouched.
- The file cannot be modified or sold. Subsetting it, or converting it to another format, needs
  KFGQPC's written approval; it ships exactly as published.
- The EULA must travel with the font: `EULA.txt` sits beside the `.woff2`, and `SOURCE.txt` records
  the mirror, version and SHA-256.
- Text is unchanged: the face renders the same Tanzil Uthmani strings; only the outlines differ.
