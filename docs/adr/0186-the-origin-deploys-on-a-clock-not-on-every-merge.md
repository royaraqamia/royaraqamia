# The origin deploys on a clock, not on every merge

Render's Hobby workspace includes **500 build-pipeline minutes a month**, and the service was set to
build on every commit to `main` (`autoDeployTrigger: commit`). The repository does not merge at that
cadence. Measured from this checkout on 2026-11-14:

- **56 deploy-triggering commits since 2026-11-12** — about 22 a day, and 848 in the previous 30 days
  once the paths `render.yaml` ignores are removed.
- **A build takes about 2m45** (ADR-0174), so the month is **~1,800 minutes** against 500.
- Render does not stop at the allowance: with no payment method it **disables all new builds for the
  rest of the month** once the 500 are spent. The service keeps serving the last build, so the first
  symptom is that nothing merged after day six is live — before a single user arrives.

The alternatives, and why they are not this change:

- **Buy the overage.** $5 per 1,000 minutes after the first 500 is ~$9/month at this cadence. It is
  cheap, and it is still a bill for a project with no revenue, for builds that mostly replace a build
  deployed hours earlier.
- **Upgrade the workspace.** Pro is $25/month and includes 1,000 minutes — still short of 1,800. The
  $7 compute plan does not touch the pipeline allowance at all; it is a per-service compute line.
- **Build in CI and deploy a prebuilt image.** The repository is public, so Actions minutes are free,
  and `runtime: image` exists. It removes the wall entirely, but it replaces the native-Node service
  ADR-0174 chose on purpose (the assistant's roster is read from `.opencode/skills/agency/` at run
  time) with an image that must copy that directory and prove it did. That is a real project, not a
  configuration flip; it stays the lever if per-merge deploys are needed later.

## The decision

1. **A merge does not build.** `render.yaml` sets `autoDeployTrigger: 'off'`.
2. **`.github/workflows/deploy.yml` owns the deploy.** A schedule calls the Render deploy hook four
   times a day — 00:00, 06:00, 12:00 and 18:00 UTC, which is 03:00, 09:00, 15:00 and 21:00 in
   Baghdad — and `workflow_dispatch` is the manual lane for a fix that cannot wait. Four builds a day
   is ~330 minutes at the recorded build time, leaving about 170 (~60 builds) for the manual lane.
3. **A train with nothing to deploy spends nothing.** The service-worker version ends in the
   seven-character commit the running build was made from. The job reads it first; when it already
   names the commit at the head of `main`, the job stops before calling the hook. Without that check a
   quiet night would rebuild the same tree and then wait for a version that cannot change.
4. **The purge moves into the deploy.** `purge-cache.yml` is deleted. Its work — wait for the new
   build to answer, then `purge_everything`, then read the discovery documents back (ADR-0177,
   ADR-0178) — is now the last steps of the deploy job. The wait is still what makes the purge
   correct: purging before the container swaps refills the cache from the old build.
5. **A build that does not answer fails the job.** It does not purge. A failed build leaves the
   previous container and its cached pages consistent; a purge of the old build while a slow new one
   is still coming would leave the new pages stale for a year.

## Consequences

- **Time-to-production is bounded by six hours, not by the merge.** That is the one user-visible
  cost: a fix merged at 09:05 is live at 12:00, or immediately through the manual lane. Merge
  cadence, review and CI are unchanged.
- **The manual lane is not free.** A hotfix dispatch is a build like any other; ~10 a week still fits
  inside the 500 minutes, but the allowance is measured on Render's Billing page, not guessed at.
- **A docs-only merge still deploys on its train.** A deploy hook ignores `buildFilter`, which only
  governs automatic builds. That is deliberate: a filter that silently skipped a deploy would leave
  the train waiting for a build it never triggered. The filter stays in `render.yaml` for the day
  auto-deploys return.
- **The train needs a secret.** `RENDER_DEPLOY_HOOK_URL` (Render → service → Settings → Deploy Hook)
  joins `CLOUDFLARE_API_TOKEN` in Actions. With it absent the workflow fails loudly rather than
  skipping silently, the same rule the purge already followed.
- **The 500-minute wall is a workspace fact, not a compute one.** Paying $7 for the `0.5c-512mb`
  compute plan at the first paying user does not raise it. If the train ever proves too slow, the
  next lever is the prebuilt image above, not a larger compute plan.
