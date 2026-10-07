# The Media Downloader stores no media, only short-lived signed links

A downloader naturally caches the finished file so it can be fetched again, and the repo
already has a Supabase Storage pattern for blog images. We decided against it: a **Download
Job** never persists media. The **Media Provider** returns a single-use signed link with a
5-minute TTL, the `download_jobs` row keeps only metadata and that link, and rows are swept by
`pg_cron` after 24 hours. The site is a pipe, not a library.

## Considered options

- **Cache media in Supabase Storage.** Rejected: stores third-party content we have no right
  to keep, and adds storage and egress cost to a free utility.
- **Proxy the stream through the Next app.** Rejected: doubles bandwidth through Vercel and
  trips the response-size limit that motivates ADR-0017.

## Consequences

A ready **Download** cannot be re-fetched once its link expires — the visitor runs another
**Download**. Nothing sits on disk to leak, and the only durable artifact is a status record
an Admin can review.
