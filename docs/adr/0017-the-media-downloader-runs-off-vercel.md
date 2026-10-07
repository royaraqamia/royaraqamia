# The Media Downloader runs on an external always-on service

The site deploys to Vercel serverless, which cannot host the work a **Download** needs:
extraction and format conversion want `ffmpeg`/`yt-dlp`-class binaries, a **Download Job**
can take tens of seconds, and the result is a large byte stream — all of which collide with
the function bundle size, execution-time and response-size limits (region `dub1`, no
`maxDuration` headroom beyond the MCP route's 60s). We decided the **Media Downloader**
delegates to a self-hosted **Cobalt** service on a small always-on host in an EU region
neighbouring `dub1`, reached through a `MediaProvider` port; the Next app only orchestrates
and never carries media bytes. A paid hosted downloader API stands behind the same port as an
emergency fallback.

## Considered options

- **Bundle a Node extractor inside a Vercel function.** Rejected: fragile, and time- and
  response-size limited; not production-ready.
- **Do it client-side in the browser.** Rejected: CORS and DRM make it infeasible for the
  Platforms we care about.
- **Use only a managed third-party API.** Rejected as the primary: the port keeps it
  available as a fallback, but self-hosting Cobalt keeps egress cost and platform coverage
  under our control.

## Consequences

There is now an always-on host to run and monitor, outside the monorepo, authenticated to the
app by a shared secret. The `MediaProvider` seam is what keeps that host replaceable, and the
repo stays free of media tooling.
