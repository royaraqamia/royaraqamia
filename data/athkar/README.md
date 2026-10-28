# أذكار الصَّباح والمساء — provenance

The text on `/athkar` is a static asset, like the Quran reader's: it ships with the build, is edited
in this repository, and is never stored in the database. Two files hold the two collections, each a
complete transcript of what the visitor reads:

- `morning.json` — أذكار الصَّباح
- `evening.json` — أذكار المساء

Both are validated against `shared/contracts/athkar.ts` at build time, so a malformed entry fails the
build instead of the page.

## Where the text comes from

The selection and ordering follow «حصن المسلم من أذكار الكتاب والسنة» للقحطاني, chapter «أذكار الصباح
والمساء», with the wording of the printed editions of the cited collections. Each item carries:

- `source.label` and `source.ref` — the collection and the hadith number where the edition numbers
  it, or the chapter/position when the numbering differs between printings;
- `virtue` — the reward or promise the narration states, and only where it states one. An item
  without a stated virtue has no `virtue` key rather than an inferred one.

Corrections are welcome and expected: this is text people recite, so the owner reviews a change to
either file the way it reviews code. A wrong vowel mark or a number that does not match the cited
printing is a defect, not a style nit.

## Why the two files repeat some entries

Ayah al-Kursi and the Mu'awwidhat are the same words in both collections, and five more entries
differ only in the morning/evening verb. They are duplicated on purpose: each file then reads as one
complete list, which is what someone correcting the text actually needs. `backend/loaders/__tests__`
holds the two files to the same text for the entries that are meant to be identical, so the
duplication cannot drift silently.

## What is deliberately not here

- No transliteration, no translation: the page is Arabic-first like the rest of the site.
- No benefit claimed for a repetition count the cited narration does not state.
- No numbering of the Ayahs inside the Mu'awwidhat text: the digits stay ASCII everywhere on the
  site, and the printed Arabic-Indic ayah numbers would violate that rule. The Mu'awwidhat uses the
  bare end-of-ayah sign (U+06DD) between Ayahs.
