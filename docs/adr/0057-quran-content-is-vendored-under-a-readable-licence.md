# The Quran content is vendored under a licence we can read

> **Amended by [ADR 0062](0062-the-quran-recitation-is-vendored-as-published.md)**, which names the
> audio source, fixes the bitrate it ships at, and adds the two obligations its licence carries.
> **Amended by [ADR 0064](0064-the-quran-is-set-in-the-kfgqpc-uthmani-hafs-face.md)**, which changes
> the reader's display face from Amiri Quran to KFGQPC Uthmani Hafs.
> **Amended by [ADR 0065](0065-the-quran-pages-carry-no-colophon.md)**, which removes the colophon
> from the Quran pages — and, on 2026-10-31, records that the Tafsir's credit travels with the Tafsir.
> **Amended below (2026-10-31)** with the channel the Tafsir is vendored through and what "verbatim"
> means for it.

The reader is offline-first (ADR-0027), and the Quran's text is the one dataset in the product
family that is fixed, public and small: the Uthmani text of Hafs ʿan ʿAsim is 1.27 MiB raw and
0.25 MiB compressed, and a normalized search index over it is under 200 KiB. So the text, the
Mushaf layout, the search index and the Tafsir are static assets served from our own origin and
cached by the service worker, and no third-party API is consulted on a page view.

Recitation audio is too large to bundle (818 MiB per Reciter at 64 kbps), so it is **vendored
rather than hotlinked**: downloaded once from a provider whose terms we can read, into storage we
control, and served from our own origin. It is never precached and never served from Vercel.

The rule that governs every asset here is that **nothing ships without a licence we can read** —
either a grant the rights holder published, or text whose copyright has expired. It is the only
thing that makes the rest of this ADR checkable, and it rules out a source that looks open but is
not: **QUL publishes no licence for any of its resources** — every Arabic Tafsir's copyright panel
is empty — so its MIT covers its code and not its data, and neither it nor a repackaging of it is a
licence source for what it carries. One asset fails the rule outright and is blocked rather than
assumed: **QUL's line-exact KFGQPC Mushaf layout**, whose copyright status QUL itself declines to
resolve.

التفسير comes from **Tafsir Center for Quranic Studies' own corpus**, published CC BY 4.0 — "share,
adapt, use commercially", with attribution to `Tafsir Center for Quranic Studies
(https://tafsir.net)` — which is a first-party grant over the editions it compiles. **الميسر** ships
first, with its residual doubt recorded rather than hidden: the KFGQPC terms page was unreachable,
so this rests on Tafsir Center's grant and not on the publisher's own. **التفسير المختصر** stays
blocked, because its publisher permits personal, non-commercial use only and Tafsir Center is a
different body from دار المختصر — a grant over another publisher's work is not a clearance of it.
One Tafsir is vendored, keyed by slug, so a second is a data addition rather than a redesign.

## Considered Options

- **A Quran API at read time, or a server-side snapshot of one.** Rejected: it puts a third party in
  the path of every page view and makes a first load without a network impossible (ADR-0027). The
  Quran Foundation's Content API also restricts content to personal, non-commercial use and forbids
  compiling its data — offline-first inverted twice over.
- **The QUL / spa5k Tafsir chain.** Rejected: the underlying texts are public domain, but the files
  travel through sources whose redistribution terms cannot be read. Public-domain words inside an
  unreadable pipeline are not a licence anyone can point at.
- **Every Tafsir in the corpus.** Rejected: Tafsir Center's database is ~214 MB; one edition is a
  few MB and is the thing a reader opens.
- **Shipping الجامع الوجيز instead.** Deferred rather than rejected — it carries the cleanest single
  grant of any candidate (CC BY-ND 4.0, from a living author) — but it is modern and the least
  established, and الميسر is the closer match. It remains available as the second edition.
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

- Attribution is a licence condition, not a comment: the Tanzil text requires the project named, a
  link to tanzil.net and its notice reproduced in every derived file, and the Tafsir requires Tafsir
  Center named. The reader used to carry that colophon; ADR 0065 removes it at the product owner's
  request and records the unmet obligation. The display font is the KFGQPC Uthmani Hafs face
  (ADR 0064), whose own EULA grants free use and distribution.
- The text is verbatim by licence — "changing it is not allowed" — so no normalization, no
  shortening and no reformatting is ever applied to the stored text. Search indexes a separate,
  normalized copy.
- A Tafsir taken from a classical source is checked for modern editor apparatus before it ships:
  bracketed footnote material is a contemporary contribution with its own copyright.
- Audio is vendored out of band, so a Reciter is added by an operator action and a commit, not by a
  deploy of the app; storage is ~818 MiB per Reciter at 64 kbps.
- Tafsir before Search: with the Tafsir's blocker gone the phases return to their original order,
  and the only two blocked items left — **التفسير المختصر** and **line-exact Mushaf pages** — are
  both gated on a written permission and neither is on the path to a first release.
- A text or layout correction is a commit and a cache-name bump, not an admin action. That is the
  deliberate no: there is no admin surface for this product.

## Amendment: the Tafsir is vendored from the centre's own published corpus (2026-10-31)

P3 ships **الميسر**. This ADR named the rights holder and the licence; it did not name the channel the
text arrives through, and that gap was the first thing to settle before any code.

- **The channel is Tafsir Center's own published corpus**, reached through the endpoint behind its
  public MCP server (`mcp.tafsir.net`), which exposes `fetch_tafsir` over the 28 editions the centre
  compiles and publishes each edition's credit in a registry resource. That is the centre's own
  surface over its own corpus — not a repackaging of it, which is the thing this ADR's rule refuses.
- **`verbatim` means what it says.** `scripts/vendor-quran-tafsir.mjs` stores the Ayah's `text_raw`
  exactly as served: no shortening, no reformatting, no markup, no fill-in. An Ayah the edition does
  not cover is stored as `null` and the reader says so, rather than borrowing a neighbour's
  commentary. A row longer than the endpoint's window arrives in parts, which are joined once — a
  read reconstructed, never rewritten.
- **The credit is the source's, not ours.** Each file carries the attribution the registry publishes
  for the edition (`التفسير الميسر، مجمع الملك فهد لطباعة المصحف الشريف`), and the surface renders it
  with the body it licenses, alongside the centre's name, a link and the licence. ADR 0065's
  amendment records why that is the one visible credit and the Tanzil notice is not.
- **One file per sura, committed**, like the text: `public/quran/tafsir/<slug>/<surah3>.json`, a
  `manifest.json` with a sha256 and a size per sura, an `index.json` naming the edition and its
  grant, and a `NOTICE.txt`. The reader fetches one sura's file the first time a tafsir is opened on
  it, under `?v=<sha256 first 8>`, and the worker caches it like any other same-origin asset.
- **The residual doubt stays recorded.** The edition's own publisher is the King Fahd Complex, whose
  terms page was unreachable; this still rests on Tafsir Center's CC BY 4.0 grant over the editions it
  compiles, which is the basis this ADR already relied on.
