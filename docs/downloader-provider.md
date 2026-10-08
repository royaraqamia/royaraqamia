# Media Downloader provider wire contract

The Next app never extracts or converts media (ADR-0017). It owns the **Download Job**
and delegates the work to a self-hosted **media host** over two HTTPS calls. This
document is the seam's external contract: the host lives outside the monorepo, so its
implementer (and any future hosted fallback behind the same `MediaProvider` port)
must match it exactly. A reference implementation (yt-dlp) lives at
<https://github.com/royaraqamia/downloader-host>.

The app picks the real host when `DOWNLOADER_PROVIDER_URL` is set; otherwise it uses
the in-repo stub, which performs the callback below against itself so the whole path
is exercised without the external service.

## 1. App → host: dispatch a job

`POST` to `DOWNLOADER_PROVIDER_URL`

```
Authorization: Bearer <DOWNLOADER_PROVIDER_TOKEN>   (omitted if token unset)
Content-Type: application/json
```

```json
{
  "jobId": "b3c1…-uuid",
  "url": "https://platform.example/watch?v=…",
  "format": "audio | video-360p | video-720p | video-1080p",
  "callbackUrl": "https://royaraqamia.com/api/downloader/callback",
  "maxDurationSeconds": 900,
  "maxSizeBytes": 209715200,
  "linkTtlSeconds": 300
}
```

The host acknowledges with any `2xx` (e.g. `202 Accepted`) once it has accepted the
job. It must then do the work **off the request path** and report back via the
callback — the app does not wait for the file. Reply `202` immediately, before
doing the work: the app waits up to 55s for this acknowledgement (so a cold or
sleeping host is tolerated), but a host that answers later than that, or not at
all, makes the app record the job as `failed` with "خدمة التنزيل غير متاحة الآن.".

A `4xx` means the link cannot be handled (surfaced to the visitor as a `failed` job
with "هذا الرابط غير مدعوم."); any other failure or a timeout surfaces as
"خدمة التنزيل غير متاحة الآن.". The host must honour `maxDurationSeconds` and
`maxSizeBytes`; the app re-checks both when the callback arrives. `linkTtlSeconds`
is optional: when present the host must set the signed file link's lifetime from
it (falling back to its own default when absent).

## 2. Host → app: report the result

`POST` to the `callbackUrl` from dispatch.

```
x-downloader-callback-secret: <DOWNLOADER_CALLBACK_SECRET>
Content-Type: application/json
```

`ready` — the signed, expiring link:

```json
{
  "jobId": "b3c1…-uuid",
  "status": "ready",
  "platform": "platform.example",
  "durationSeconds": 123.4,
  "file": {
    "url": "https://host.example/media/…?sig=…",
    "filename": "clip.mp4",
    "sizeBytes": 10485760,
    "expiresAt": "2026-10-07T12:05:00.000Z"
  }
}
```

`failed` — a reason the visitor can read, plus an optional machine-readable `code`
(`duration`, `size`, `unsupported`, `blocked`, `unavailable`, `timeout`, `generic`):

```json
{
  "jobId": "b3c1…-uuid",
  "status": "failed",
  "code": "blocked",
  "error": "هذا الرابط خاص أو محميّ."
}
```

`code` is for observability: the app tags the failure in Sentry with it, so a
platform that starts refusing the host (bot check, rate limit, IP block) shows up
as `blocked` instead of blending into `generic`. The host logs the raw extractor
output alongside it. Omitting `code` is valid — the app treats it as unclassified.

The app replies `200 {"success":true}` and moves the job to `ready` or `failed`.
The route rejects a missing or wrong secret with `401` and never trusts a public
caller. A host that never calls back leaves the job `running`, which the retention
sweep reconciles to `failed` (#155).

The link must be single-use and expire within `DOWNLOAD_LINK_TTL_SECONDS` (5 minutes);
the app stops handing it out once `expiresAt` passes (ADR-0018).
