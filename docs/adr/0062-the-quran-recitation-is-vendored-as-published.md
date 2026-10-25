# The Quran recitation is vendored as published

> **Amended by [ADR 0065](0065-the-quran-pages-carry-no-colophon.md)**, which removes the colophon
> from the Quran pages.

> **Amended by [ADR 0081](0081-the-offline-recitation-is-fetched-from-the-audio-host.md)**, which fixes
> how a downloaded Surah reaches the reader: the page fetches this host directly, and the copy is kept
> in OPFS.

The reader has its text (ADR-0057) and its reading state (ADR-0056); the missing piece is the
recitation. The rule that governs every asset in this product is that **nothing ships without a
licence we can read**, and exactly one source of Ayah-level Quran audio publishes terms that cover
what we need to do with it — the one ADR-0057 referred to without naming, when it noted that "the one
that does publish terms sends no CORS header". It is **AlQuran Cloud, an Islamic Network project**,
whose media CDN is `cdn.islamic.network`. Its terms say of recitations:

> Recitations are licensed to us by the reciters or their estates for free, non-commercial
> redistribution **at the bitrates we publish**. You may stream, embed and download them for personal
> and educational use. You may bundle them into a commercial product, but please note that copyrights
> lie with the reciters and they may ask you to remove the content.

So the Reciter is **Mishary Rashid Alafasy, Murattal (`ar.alafasy`), at the published 64 kbps**, and the
bytes are vendored into storage we control and served from our own origin — never hotlinked, never
precached, never from Vercel (ADR-0057).

**The bytes are the published bytes.** No transcode, no re-encode, no loudness pass, no trimming. This
is not only an engineering preference: the grant is bounded to _the bitrates they publish_, so
choosing a bitrate of our own would step outside the permission we are relying on, and normalising or
trimming would alter the recitation — the same principle as ADR-0057's "changing it is not allowed"
for the text. The files are MPEG-2 Layer III at 22.05 kHz, which is what makes 64 kbps the right size
for a voice at this quality.

**One Ayah is one file, and that is also what a reader plays.** ADR-0057 rejected per-Surah tracks and
chose Ayah files; this ADR upholds that, now with the numbers. Alafasy's per-Surah files are published
at 128 kbps only — the 64 kbps per-Surah URL returns `403` for every Surah tested, including
Al-Baqarah and An-Nas — and Al-Baqarah alone is **116.16 MiB** at 128. A reader on a Syrian mobile
connection who taps an Ayah should fetch the few hundred kilobytes of that Ayah, not a two-hour file,
and a listener who stops after twenty Ayat should have paid for twenty Ayat. Ayah files also make
highlighting exact with no dataset to ship: **the Ayah being played is the file being played**.

**Where the bytes live.** Cloudflare R2, behind a custom domain of ours —
`audio.royaraqamia.com` — which is where ADR-0047 left the question ("free egress and a real CDN") and
deferred it as scope for a file fetched a few hundred times a month. This is the first asset whose size
and streaming make that cost worth paying, and the numbers are not close. Supabase's free plan carries
1 GB of storage and ~5 GB of egress a month, shared with the APK install path: one Reciter is 818 MiB,
so it holds exactly one and no more, and a second Reciter ends it at $25 a month. R2 carries 10 GB-month
of storage — twelve Reciters at 64 kbps — free egress, and ten million Class B reads a month, for
nothing, after which the meter is requests rather than bandwidth. The APK's rewrite is therefore
deliberately _not_ the pattern here: audio is served straight from R2, never proxied through Vercel,
whose Hobby transfer budget cannot carry a stream.

Two things make that work, and they are configuration rather than code. `.mp3` is already on Cloudflare's
default cached-extension list, and the objects carry `Cache-Control: public, max-age=31536000, immutable`,
so the edge absorbs the reads without a cache rule. And the bucket's CORS policy allows `GET` from
`https://royaraqamia.com`, which the offline download needs; plain playback would not.

Getting there meant moving `royaraqamia.com` onto Cloudflare's nameservers: Cloudflare's partial (CNAME)
setup, which leaves DNS where it is, is Business and Enterprise only, so the alternative was a one-off
nameserver move on the free plan or no custom domain at all. The site stays proxied to Vercel and
unchanged, and the email records — Titan's MX and SPF, DMARC at `p=reject`, Resend's DKIM and send
subdomain — were verified from outside afterwards, because a record lost there fails silently.

**What is committed is the manifest, not the audio.** `public/quran/audio/<edition>/index.json` names
the editions with their bitrate, sample rate and the attribution their licence requires, and
`public/quran/audio/<edition>/<surah>.json` carries that Surah's files with a `sha256` and size each,
plus the Surah's total bytes — which is what lets the reader tell a listener how much space an offline
Surah will take before it starts. The layout mirrors the text's own (`meta/index.json` plus a file per
Surah), and a Surah's files live under one prefix (`<edition>/<surah>/<ayah>.mp3`), re-keyed from the
CDN's 1–6236 global Ayah numbering, which our vendored index already reconciles.

**A takedown is one commit.** The licence contemplates removal — "they may ask you to remove the
content" — so every request carries the file's own hash as a `v` query, taken from the manifest, and an
`immutable` URL is then truthful: a replacement is a new `v`, which is a new key in every cache and in
every downloaded copy, with no bucket rename and no invalidation choreography. Because audio is never
precached, we hold no copy the reader did not ask for, and removing an edition is a commit that deletes
its manifest.

## Considered Options

- **Transcoding to AAC or Opus, with a loudness pass per Ayah.** Rejected: the grant is bounded to the
  bitrates they publish; it would add a second lossy generation; and a loudness pass alters the
  recitation for no benefit a reader asked for.
- **Concatenating the Ayah frames into one file per Surah, with an offset map derived from frame
  counts.** Rejected: it buys gapless playback and one request per Surah, and it costs a derived
  artefact whose failure is silent — highlighting drifts and a seek lands between Ayat. Gapless is not
  a requirement here: the reciter pauses at every Ayah, so a boundary between two files is inaudible,
  and a listener fetches the next Ayah while the current one plays. This is the concrete alternative
  ADR-0057 was rejecting when it rejected per-Surah tracks.
- **The 128 kbps per-Surah set.** Rejected: it doubles storage to 1.59 GiB per Reciter for a difference
  no reading benefits from (ADR-0057), and it would take the Ayah boundaries with it.
- **Hotlinking the CDN.** Rejected for the second time, now with the reason named: their files send no
  `access-control-allow-origin`, so a browser cannot fetch them for offline use at all — and it would
  put a third party in the path of every page view, with a removal clause as its failure mode.
- **EveryAyah, or mp3quran.net.** Rejected: neither publishes any terms — EveryAyah's site carries no
  licence text and `mp3quran.net/api` is a bare directory index — so both fail the rule this ADR is
  built on, however good their coverage is.
- **QuranicAudio, or quran.com.** Rejected: explicitly personal-use-only. Their files "may be
  downloaded and used for personal use free of charge… you may not use these files for commercial
  purposes", and Quran.com's terms forbid redistribution and, separately, the scraping a vendoring run
  is.
- **A second Reciter at 32 kbps.** Deferred: `ar.hudhaify` is published at 32 kbps, which would halve
  what it stores — but R2 has room for a second Reciter at 64, so there is no reason to trade fidelity
  for bytes. One good recitation beats two dull ones, and a Reciter is a data addition rather than a
  redesign.
- **Supabase free, which this ADR first chose.** Rejected: 1 GB of storage is one Reciter with no room
  for a second, ~5 GB of egress a month is shared with the APK install path — so audio's success would
  break app installs — and the second Reciter ends the free plan at $25 a month, where R2 is the same
  $0 at twelve.
- **Cloudflare's partial (CNAME) setup, keeping DNS at Vercel.** Rejected: it is available on Business
  and Enterprise only, so it would cost more per month than the whole storage bill.
- **The `r2.dev` public development URL.** Rejected: Cloudflare documents it as rate-limited, intended
  for non-production, and an unsupported access path.
- **Proxying R2 through a Vercel rewrite, as the APK does.** Rejected: the bytes would cross Hobby's
  10 GB a month of Fast Data Transfer, which is the one thing streamed audio cannot do.

## Consequences

- The colophon grows: alongside Tanzil and the Tafsir Center it must name **Alafasy and Islamic
  Network**, which is what the grant asks for and the minimum courtesy both sources ask of anyone
  republishing. ADR 0065 removes that visible colophon; the obligation is now unmet and recorded
  there.
- **Residual doubt, recorded rather than hidden.** The grant is Islamic Network's, not the reciter's or
  their estate's, and this reader sits on a site that also sells services. A courtesy note to Islamic
  Network goes out before the first Reciter ships — a note, not a permission request, because the grant
  is already public.
- Audio is served from a host of ours but not from our origin, so the site's CSP has to name it: there
  is no `media-src` today, so `default-src 'self'` blocks third-party audio outright, and the offline
  download needs `connect-src` as well.
- Vendoring is an operator action: `scripts/vendor-quran-audio.mjs` runs by hand against the bucket's S3
  endpoint (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) — idempotent,
  resumable and checksummed, fetching the published files, verifying that the set is uniform, and
  writing the manifests — and then the manifests are committed. The audio never enters git. A resume
  may pass `--trust-manifests` to take a complete manifest's hashes and confirm each file with a bucket
  `HEAD` instead of fetching the set again: restarting a long run is otherwise about as expensive as
  starting it, which on a connection that drops is what leaves a partially vendored Quran stuck. The
  default still re-fetches, so a source that re-published a file is caught by the run that asks.
- Vendoring finished on 2026-10-19: **114 Suras, 6236 Ayat, 820.56 MiB**, and `index.json` reads
  `complete: true`. The manifests for all of them are committed — a SHA-256 and a size per Ayah — and the
  audio still is not. Spot checks across the range answer from `audio.royaraqamia.com` with the byte
  length their manifest claims and `Cache-Control: public, max-age=31536000, immutable`, so the e2e
  spec's "no Recitation" case now skips itself: no Surah lacks one.
- No timing dataset is needed for Ayah highlighting, so `quran-align` (CC BY 4.0) stays out of the
  build: one fewer asset and one fewer licence obligation.
- The acceptance test is **a device in Syria playing one Surah over mobile data**. Nothing on this
  machine can prove reachability or what a mobile connection does with a 64 kbps stream, and ADR-0047's
  lesson is that the host we know loads there is the host that matters.
