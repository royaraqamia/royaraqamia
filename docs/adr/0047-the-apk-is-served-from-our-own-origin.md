# The APK is served from our own origin

The manifest the shell follows names one URL — `apkUrl` — and until now that URL
was a GitHub release asset. Two things read it: an installed shell downloads and
installs that file, and the account area offers it to a browser for the first
install. Both of them were pointing at a host that is not reachable from at least
one country this app has users in. An update that cannot be downloaded is not an
update, and an install link that 404s is not an install link.

**The bytes live in our own storage, and the site serves them.** A public Supabase
Storage bucket holds `royaraqamia-<version>.apk`, and `next.config.js` rewrites
`/android/<version>.apk` to it, so the URL a device fetches is
`https://royaraqamia.com/android/royaraqamia-1.0.4.apk`. The GitHub release still
carries the same file as the permanent archive, but nothing a device downloads
depends on GitHub anymore.

**A rewrite, not a route handler.** A Vercel Function's response body is capped at
4.5 MB and the APK is 7.4 MB, so a handler proxying the file would fail on the
first real download. A rewrite is proxied at the routing layer: no cap, no function
invocation, no Fluid CPU — which matters on a plan whose Active CPU cap has already
been hit once (docs/vercel-usage.md). The source pattern is constrained to
`.*\.apk` on purpose, and `/android/latest.json` is a file in `public/` — filesystem
routes are matched before rewrites, so the manifest is never proxied to the bucket.

**Why our own origin rather than the storage URL.** The storage URL would very
probably work — the app already talks to Supabase from the device — but "probably"
is not something this project ships to the one country whose reachability actually
matters. `royaraqamia.com` is the host we know loads there, because it is the host
the app is. The indirection also means the host can move again later without
touching the manifest, the app, or a single installed device.

**Deciding the host was the whole cost.** Both consumers read `apkUrl`, so nothing
in the app changed: no Java, no Capacitor config, no APK release. A device on 20002
or 20003 picks the new host up on its next update check, and a browser picks it up
on the next page load. This is the payoff of the manifest being the only thing that
names the bytes.

**A version's bytes stay immutable.** Objects are named for the version, the upload
sends `x-upsert: false` so an existing object can never be replaced, and the
manifest carries the sha256 of exactly what it points at. The publish workflow
verifies the URL the manifest names — fetched from outside, through the site — and
refuses to commit the manifest if the bytes or the size disagree. That check is what
proves the rewrite serves the file, since it is the same path a device takes.

## Considered Options

- **Keeping the GitHub release asset and adding a mirror.** Rejected: two sources of
  truth for one artifact, and the device still needs a host that resolves for it.
  The mirror would be the thing that matters, which is the decision this ADR is.
- **Pointing `apkUrl` straight at the Storage public URL.** One fewer moving part
  and no transfer through Vercel. Rejected for reachability: it makes
  `*.supabase.co` the host a device must reach, which cannot be verified from here
  and is exactly the assumption that just failed with GitHub.
- **Vercel Blob.** The same platform as the site, so no new provider. Rejected: a
  new dependency, and the transfer lands on the Hobby meter that already reached a
  cap — while Supabase Storage is already in the stack (`avatars`, same bucket
  pattern, same service-role secret in CI).
- **Committing the APK into `public/`.** No proxy, no bucket, no cache rule.
  Rejected: ~7.4 MB per version in git forever, and it lands in every retained
  deployment's storage — tens of versions against a 10 GB cap that pruning exists
  to protect.
- **A Cloudflare R2 or another CDN in front.** Free egress and a real CDN.
  Rejected as scope: a new provider, new secrets, new DNS, for a file that is
  fetched a few hundred times a month.

## Consequences

The download now crosses two meters instead of one: the site's Fast Data Transfer
(10 GB/month on Hobby, measured at 1.88 GB) and Supabase's egress on the free plan
(~5 GB/month, ≈650 downloads of a 7.4 MB APK). At the current traffic — 419
visitors a month — that is comfortable, but it is a cap that can be reached by
success, and it belongs next to the others in docs/vercel-usage.md.

The path is cached for a year (`immutable`) because a version's bytes never change,
and the filename carries the version, so a new release is a new URL and never a
cache-bust.

If the rewrite ever fails in a way the CI check cannot see — a plan that refuses
external proxying, say — the fallback is a `308` from the same path to the storage
URL: one entry in `redirects()`, no manifest change, no app change. The CI check
fetches the manifest's URL from outside, so that failure surfaces as a failed
publish rather than as a user's failed update.

**The acceptance test is a device in Syria.** Nothing on this machine can prove
reachability there, so the last step of this change is a real download on a real
phone, from the site and from the app's own update prompt. Everything before it is
a necessary condition, not the proof.

**Two deliberate gates stand between merging this and a device using it.** The
bucket migration is a Storage write, so `Migration Drift` refuses it on `main` and
waits for a person (ADR-0041) — the bucket does not exist until someone applies it,
and the one-off that moves the current release cannot upload until then. And the
first publish after the rewrite has to run after the deploy that carries it, which
is why the verification step retries for two minutes rather than once.
