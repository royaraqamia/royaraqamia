# The Mushaf's boundaries come from the metadata the suras do

P5 needed the printed Madani Mushaf's boundaries: where each of the 604 pages opens,
and where the 30 juz, 60 hizb and 15 sajdas fall. The issue named the MIT
`rn0x/Quran-Data` mapping, and its own note asked for the fields to be verified
before the vendor script was written.

They were. That dataset carries the 604 page→Ayah ranges and, per Ayah, `juz`,
`page` and `sajda` — but no `hizb` anywhere, so a hizb boundary would have had to be
derived from juz quarters anyway. And its MIT covers the repository: the text inside
it is Tanzil's, which is the QUL-chain caveat ADR-0057 already rejected as a licence
source. Taking only the ranges would keep the mapping clear of it, but the file would
still be a second grant to read for data that another file already holds.

The metadata this project already vendors its sura list from — Tanzil's
`quran-data.xml` — carries all of it: `<pages>` (604), `<juzs>` (30), `<hizbs>`
(240 quarters) and `<sajdas>` (15, each typed `obligatory` or `recommended`). Same
source, same grant, same notice as the text. One vendor script fewer, one licence
fewer, and the hizb stops being a derivation from a dataset that did not have it.

## The decision

- **The boundaries are vendored from Tanzil's metadata**, into
  `public/quran/meta/pages.json`, by `scripts/vendor-quran-pages.mjs`. The file names
  the notice it travels with, as every file derived from the text does.
- **The hizb is derived from the quarters, and the juz is used to check it.** Tanzil
  publishes quarters, four to a hizb and eight to a juz; the script derives the juz
  boundaries from the same quarters and fails unless they equal the published
  `<juzs>` block. The derivation is therefore a check, not a guess.
- **Every boundary is resolved against the vendored text before anything is
  written.** A boundary on an Ayah the text does not have would render a mark on no
  Ayah, silently; the vendor script and `scripts/__tests__/quran-pages.test.mjs` both
  refuse it.
- **A boundary is a label on the Ayah that opens it, not a layout.** The reader stays
  verse-by-verse (ADR-0057) and the text still reflows; what ships is a quiet rule
  with «صفحة 2», «الجزء 2», «الحزب 3» and, where a prostration falls, its kind.
- **The page jump ships now and lands on `#ayah-N`.** A printed page number is a
  thing a reader already knows, and answering it needs only the mapping — not the
  KFGQPC layout. The landing Ayah is marked by the sura route (#772), so a jump
  arrives somewhere visible.
- **The page-per-screen view stays unbuilt.** It is still the one part of P5 that has
  to be redone once the layout's licence is cleared, and the toggle stays unbuilt
  rather than built wrong.

## Why not the alternatives

- **`rn0x/Quran-Data`**, as the issue planned: no hizb, a second grant, and its text
  is the same Tanzil text under a licence that says nothing about it.
- **A per-Ayah page number in the asset** (1,208 numbers rather than 604 starts): the
  same information, twice the bytes, and a second place for the mapping to be wrong.
- **Deriving the juz from the quarters and dropping the `<juzs>` block**: it would
  save 30 entries and lose the cross-check that makes the derivation true.
- **Jumping by scrolling to a page's first Ayah without the hash**: the reader would
  arrive at a place with no indication that it is the one they asked for.

## Consequences

- The reader gains marks it never had, with no request, no client bundle and no
  change to the text's bytes: every mark is decided at build time and rendered into
  the static sura page.
- `check:precache` is unaffected — the boundaries are read on the server, not
  fetched by the browser.
- If KFGQPC's layout is ever cleared, the page view reads this same file. The mapping
  is the seam, and it is now the only place a page is defined.
