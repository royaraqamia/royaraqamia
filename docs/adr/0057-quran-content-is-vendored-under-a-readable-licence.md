# The Quran content is vendored under a licence we can read

The reader is offline-first (ADR-0027), and the Quran's text is the one dataset in the product
family that is fixed, public and small: the Uthmani text of Hafs ʿan ʿAsim is 1.27 MiB raw and
0.25 MiB compressed, and a normalized search index over it is under 200 KiB. So the text, the
Mushaf layout, the search index and the Tafsir are static assets served from our own origin and
cached by the service worker, and no third-party API is consulted on a page view.

Recitation audio is too large to bundle (818 MiB per Reciter at 64 kbps), so it is **vendored
rather than hotlinked**: downloaded once from a provider whose terms we can read, into storage we
control, and served from our own origin. It is never precached and never served from Vercel.

The rule that governs every asset here is that **nothing ships without a licence we can read**.
That is not a preference about provenance; it is the only thing that makes the rest of this ADR
checkable. Two assets fail it and are therefore blocked rather than assumed: **التفسير المختصر**,
whose publisher permits personal, non-commercial use only, and **QUL's line-exact KFGQPC Mushaf
layout**, whose copyright status QUL itself declines to resolve.

## Considered Options

- **A Quran API at read time, or a server-side snapshot of one.** Rejected: it puts a third party in
  the path of every page view and makes a first load without a network impossible (ADR-0027). The
  Quran Foundation's Content API also imposes OAuth, a 7-day re-sync obligation and a 1-week cache
  cap, which is offline-first inverted.
- **Hotlinking someone else's audio CDN.** Rejected: it makes an asset we ship depend on terms we
  cannot read, and it makes offline Recitation permanently impossible — the two providers with the
  best coverage publish no licence at all, and the one that does publish terms sends no CORS header,
  so its files cannot even be cached.
- **128 kbps audio.** Rejected: it doubles storage to 1.59 GiB per Reciter for a difference no
  reading benefits from.
- **Per-Surah audio tracks.** Rejected: per-Ayah files make Ayah highlighting exact by construction,
  with no timing dataset to ship or maintain, and they give offline download a useful granularity.
- **KFGQPC's glyph-encoded Uthmani Hafs text.** Rejected _for now_: it is the reference encoding,
  but its terms of use were unreachable, so it fails the rule above. Tanzil's Uthmani is derived,
  verified against the Madina Mushaf, and carries readable terms.
- **Serving audio from Vercel.** Rejected: the Hobby egress budget cannot carry it.

## Consequences

- Attribution is a shipped surface, not a comment: the Tanzil text requires the project named, a
  link to tanzil.net and its notice reproduced in every derived file, which means a colophon on the
  reader. The display font is Amiri Quran (SIL OFL) rather than a KFGQPC font.
- The text is verbatim by licence — "changing it is not allowed" — so no normalization, no
  shortening and no reformatting is ever applied to the stored text. Search indexes a separate,
  normalized copy.
- Audio is vendored out of band, so a Reciter is added by an operator action and a commit, not by a
  deploy of the app; storage is ~818 MiB per Reciter at 64 kbps.
- Two planned phases cannot be committed to a date: التفسير المختصر is blocked pending written
  permission from its publisher, and line-exact Mushaf pages are blocked pending clarification of
  the KFGQPC layout's licence. Search has no such blocker and lands before the Tafsir.
- A text or layout correction is a commit and a cache-name bump, not an admin action. That is the
  deliberate no: there is no admin surface for this product.
