# The Media Downloader inspects a link before downloading it

A Download used to be the first time we learned anything about a link: the visitor picked a
format from a fixed list, blind, and only then did the host run the extractor. We add a
synchronous **inspect** step — host `POST /probe`, app `POST /api/downloader/inspect` — that runs
the same `yt-dlp -J` the dispatch path already runs, and returns the link's Platform, media kind
(video/audio/image) and a per-format size estimate. The format field is now driven by what the
link actually is, and a link the provider cannot reach comes back as a shaped reason instead of a
failed Download.

## Considered options

- **Probe inside the create/download job only.** Rejected: the visitor chooses a format _before_
  a job exists, so the metadata has to come back on its own, ahead of the download.
- **Client-side heuristics from the URL alone.** Rejected as the primary mechanism: a domain map
  is cheap but wrong on a page that is a photo post or an audio track. It survives only as the
  fallback when the probe is unavailable.
- **Cache probe results in Upstash.** Rejected for now: the host is a single long-lived process,
  so an in-memory cache there is effective, free, and spares the app a Redis round trip.

## Consequences

Inspect spends real extractor CPU and is subject to the same egress IP blocks as a download, so it
is rate-limited (looser than the download path) and cached for ten minutes. A probe failure never
blocks a download: `unknown` falls back to the full format list, best-effort. The format
vocabulary stays ours, not yt-dlp's — the host maps raw streams onto our formats and the app owns
the copy.
