# The Quran search asset is the text, and the fold happens in the browser

P4 needs a search over 6,236 Ayat with no third party in the path of a search and
no network for a reader who has already searched once. ADR-0057 settled where the
bytes live — a static asset under `public/`, fetched on demand — but not what the
asset _is_.

The obvious answer was a pre-normalized corpus: strip the marks and the hamza
variants at build time, ship a smaller file, and scan it. The issue's own plan said
"normalized per-Ayah text plus offsets".

It does not survive contact with the display. A hit has to be shown in the Ayah's
own writing, because a reader is being shown the Quran: a normalized corpus would
render «سموت» where the Mushaf prints «سَمَٰوَٰتٍ», and no amount of marking makes
that the text. The alternative — a second asset holding the verbatim Ayat — is two
copies of 6,236 Ayat that can drift, and drift between them is exactly what a
licence that says "CHANGING IT IS NOT ALLOWED" cannot tolerate.

## The decision

- **The asset is the verbatim text, in reading order, in one array.** It is built
  from `public/quran/surah/**` by `scripts/build-quran-search-index.mjs`, compact
  JSON, with a manifest carrying its size and sha256. 1,307 KiB raw, 257 KiB
  gzipped — the text's own size, which is why the budget is stated compressed.
- **The comparison copy is folded at load, in the browser, by the same function the
  query uses.** `shared/contracts/quran-search.ts` owns that function, the corpus
  and the query are folded by it, and it cannot drift from itself.
- **The offsets are computed at load rather than stored.** A 6,236-entry offset
  table would spend ~50 KiB repeating what one split of the array answers, and the
  mapping from a position to `(surah, ayah)` already exists as the sura counts the
  page ships anyway.
- **The fold has two passes.** Marks, tatweel, the four alefs, the hamza carriers,
  alef maqsura and ta marbuta are folded first — an exact pass. If that finds
  nothing, a second pass drops the long vowels from both sides, because the Uthmani
  spelling writes some of them differently from the way a reader types:
  «ٱلصَّلَوٰة» is الصلاة, «ٱلزَّكَوٰة» is الزكاة. The second pass is what makes the
  most ordinary words in the text findable; it runs only when the first found
  nothing, so a query the text can answer as typed is never widened.
- **The notice travels with the asset.** Tanzil requires the copyright block "in
  all files derived from or containing substantial portion of this text", so the
  index names `public/quran/meta/NOTICE.txt` and the build test asserts it is still
  there.

## Why not the alternatives

- **A pre-normalized corpus** displays a Quran that is not the Quran. Rejected on
  the product's own ground.
- **Normalized and verbatim assets side by side** doubles the bytes and creates two
  copies of the text with no single source of truth.
- **A word index (inverted file)** is smaller to scan but larger to ship, needs a
  tokenizer that has to agree with the query side about Arabic particles, and solves
  a performance problem that does not exist: a substring scan over 6,236 folded
  strings is sub-millisecond, which is also why there is no Web Worker.
- **Vendoring Tanzil's "simple" (imlaei) text as a second corpus** would answer
  modern spelling without the loose pass. It is a real option and the honest
  upgrade if the loose pass ever proves too noisy — but it is a second text to
  vendor, licence and keep current, and the loose pass is measurable today.

## Consequences

- The page load pays the text once (257 KiB compressed), on first focus of the
  field, never with the page and never precached (ADR-0071).
- `npm run check:quran-search` fails a stale asset, an asset over its budget, and a
  corpus that has started riding in a module instead of in the fetched file.
- The loose pass can answer with a nearby spelling; every hit is still the Ayah's
  verbatim text, and the cap keeps the answer readable. If precision ever becomes
  the complaint, the imlaei corpus above is the documented way out.
