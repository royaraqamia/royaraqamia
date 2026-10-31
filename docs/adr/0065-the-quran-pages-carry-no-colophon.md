# The Quran pages carry no colophon

ADR 0057 made attribution a shipped surface: the Tanzil text is CC BY 3.0 and asks for the project
named, linked, and its notice reproduced; ADR 0062 added the reciter and Islamic Network for the
recitation. The index and the reader both rendered that colophon at the foot of the page.

The product owner has asked for it to be removed from the Quran pages. That is a deliberate departure
from the licence condition, not a judgement that the condition no longer applies: the text is still
Tanzil's, the recitation is still Islamic Network's, and CC BY 3.0 still asks for attribution. It is
recorded here so the gap stays visible to whoever owns the licence question next, rather than being
discovered later from a missing notice.

## Considered Options

- **Keep a compact one-line credit.** Rejected by the product owner: the request was to remove the
  section, not to shrink it.
- **Move it to the site-wide footer.** Rejected for the same reason; the credit would still be a
  visible surface on the Quran pages.
- **Remove it.** Chosen, with the unmet obligation recorded above.

## Consequences

- The reader and the index no longer render `QuranAttribution`; the component is deleted.
- The attribution obligation is unmet on the pages that show the text and offer the recitation. If it
  is restored, it belongs on both surfaces, not in a comment.
- The source data stays in `public/quran/meta/index.json` and the audio manifests; only the visible
  surface is gone.

## Amendment: the credit travels with the licensed content (2026-10-31)

P3 ships the Tafsir (ADR 0057), whose CC BY 4.0 grant asks for attribution. The owner's instruction
was about the Quran **pages**, not about licensed content as such: the credit was removed from the
surface that shows the text, and it is now rendered with the Tafsir body it licenses — the edition's
own attribution as the source publishes it, the holder's name and a link, and the licence. It sits in
the panel, not in a footer, so it travels with the words it covers.

That leaves the two obligations this ADR recorded in two different states, deliberately: the Tanzil
notice for the Quran text is still unmet on the reading surface, and the Tafsir's obligation is met
on the surface that shows the Tafsir. `public/quran/tafsir/moyassar/NOTICE.txt` carries both names and
the licence for a reader of the data rather than the page, and
`scripts/__tests__/quran-tafsir-assets.test.mjs` fails if the credit leaves either place.
