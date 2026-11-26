# The origin runs on a self-managed VPS

The Render free instance is OOM-killed every few days: p95 memory 425 MiB
against a 400 MiB budget, a peak of 429 MiB of 512, and a restart that takes
every open chat and MCP stream with it (issue #1767). The caps in
`docs/memory-budget.md` and ADR-0210 are in place and the warnings came back,
so the documented upgrade trigger is met. A return to Vercel is not available:
Hobby was paused twice at 4,374 pageviews on 4h06m of Fluid Active CPU, and
Cloudflare Workers fails both on its 10 ms CPU budget and on the Windows build
of `opennextjs-cloudflare` with Node middleware (ADR-0174).

A 2 vCPU / 2 GB VPS costs $6.70 a month. It is a real Linux machine, so the
native dependencies this app already relies on -- `sharp`, `web-push`, the
`node:dns` egress guard and the specialist roster read from disk -- run
unchanged, and long-lived SSE streams are ordinary connections rather than a
platform limit. Supabase stays managed; only the Next.js origin moves.

## The decision

1. **Build the image in GitHub Actions, publish to GHCR, run it on the VPS.**
   The 2 GB box cannot hold this build: the Render build machine used a 6 GB
   old-generation heap, and `next.config.js` caps the worker pool at two when
   `RENDER` is set. The workflow dispatches from `main`, passes the public
   `NEXT_PUBLIC_*` values as build args and the service-role key as a BuildKit
   secret, and pushes `:latest` plus the commit SHA. The VPS only pulls and
   runs Compose; no source, no toolchain and no secrets live in the image.
2. **Docker Compose with Caddy, not Coolify.** Two containers are enough: the
   app bound to the internal network and Caddy terminating TLS on 80/443.
   Coolify would add its own Postgres, Redis and dashboard to a 2 GB box that
   is already running Next.js.
3. **Cloudflare stays in front.** Its cache rules and the warm Worker are the
   reason the old 5 GB origin bandwidth cap held; they keep working with a new
   origin IP. The origin serves one hostname behind Caddy, so only DNS and the
   origin IP change.
4. **Render stays live until the new origin is verified.** A temporary
   `vps.royaraqamia.com` name proves sign-in, chat streaming, MCP and the APK
   discovery documents before the main A record moves. Render Free costs $0,
   so it remains an instant rollback for a few days after cutover.
5. **No application code changes.** `Dockerfile`, `.dockerignore`, the publish
   workflow and `deploy/vps/` are deployment artifacts; the app still starts
   with `npm start` and still reads its specialist roster from
   `.opencode/skills/agency`.

## Alternatives

- **Render `1c-2g` at $25.** Zero ops and the existing deploy hook, but 1 vCPU
  and 2 GB for four times the price. Kept as the rollback, not the destination.
- **Build on the VPS with a swap file.** No registry to manage, but a 2 GB
  build of a page set that once needed 6 GB is slow and can take the running
  site down with it.
- **Hostinger KVM 2.** Better $/GB, but a 24-month prepayment with no revenue
  yet. Reconsider when the hosting bill is paid by users.

## Consequences

- Publishing an image is a manual dispatch, matching the current deploy
  workflow: a merge does not ship. Pulling on the VPS is one script.
- Runtime secrets move from the Render dashboard to `/opt/royaraqamia/.env` on
  the VPS; that file is outside the repository and is never baked into an image.
- The VPS has no platform backups. The database still has the daily verified
  R2 dumps and restore drill in `docs/supabase.md`; the box itself needs
  provider snapshots or a documented rebuild from the image and env file.
- `scripts/memory-watch.mjs` keeps watching Render, which becomes idle after
  cutover; its issue closes when that origin is calm again. The 512 MB budget
  page stays as the record of why the move happened, not as a live constraint.
