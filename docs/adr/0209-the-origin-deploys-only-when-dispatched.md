# 0209. The origin deploys only when dispatched

## Status

Accepted (2026-11-19). Supersedes the clock decision of ADR-0186.

> **Amended 2026-11-26 — see ADR-0221.** The dispatch rule now has a second door: a manual dispatch of
> `Publish origin image` builds and pushes the image, and the VPS pulls it with `deploy/vps/deploy.sh`.
> The product of the rule is unchanged — a merge ships nothing, a person decides — and the Render hook
> path described here stays the rollback until the cutover is signed off.

## Context

ADR-0186 stopped the origin building on every push. Render's Hobby workspace includes
500 build-pipeline minutes a month, and at the recorded cadence (~22 deploy-triggering
merges a day, ~2m45 a build) a push-triggered deploy would cost about 1,800 minutes —
enough to have new builds disabled for the rest of the month. A merge no longer builds;
`.github/workflows/deploy.yml` called the hook on a four-a-day clock and on demand.

The clock was a cost control, not a requirement. At the recorded cadence it spent roughly
330 of the 500 minutes, and it bounded time-to-production at six hours by shipping whatever
was on `main` at 00:00, 06:00, 12:00 or 18:00 UTC — including commits nobody chose to
deploy. The owner wants deploys to happen only when a person asks for one.

## Decision

1. **Dispatch is the only trigger.** The `schedule` block is removed from
   `.github/workflows/deploy.yml`; `workflow_dispatch` is the sole entry point. No GitHub
   schedule calls the hook, and `render.yaml` keeps `autoDeployTrigger: 'off'`, so a push
   to `main` builds nothing either.
2. **The rest of the job is unchanged.** A dispatch on `main` calls the hook, waits for
   `sw-version.js` to stop naming the old build, checks the discovery documents and purges
   the edge (ADR-0177, ADR-0178). A build that does not answer still fails the job rather
   than purging a stale container.
3. **A no-op dispatch spends nothing.** The running build's seven-character commit is read
   first; when it already names the commit at the head of `main`, the job stops before
   calling the hook. Removing the clock does not remove that guard.
4. **`purge_only` stays.** It still skips the build and re-runs the discovery check and the
   purge, for a purge that failed after a build had already landed. The `reason` input still
   records why the deploy was run, without the old "next train" framing.

## Why not the alternatives

- **Keep the clock and add an approval flag.** Two triggers where one person deciding is the
  whole requirement; the skipped trains would still be scheduled and visible as no-ops.
- **Deploy on every push.** That is the ~1,800-minute wall ADR-0186 removed, and it puts the
  build minute back on the merge cadence rather than on a deliberate deploy.
- **Call the Render hook by hand and delete the workflow.** The hook alone cannot wait for
  the new build to answer, read back the discovery documents, or purge the edge — those are
  the steps that make a deploy safe (ADR-0177, ADR-0178). The workflow is that verification.
- **Turn `autoDeployTrigger` back on with a build filter.** A hook ignores the filter, and a
  push-triggered build would spend the allowance on every non-ignored merge regardless of who
  wanted it live.

## Consequences

- Time-to-production is unbounded by design: a merge stays undeployed until someone dispatches
  the workflow on `main`. There is no clock to fall back on.
- Build minutes are spent only on dispatches that have something to deploy. The allowance is
  still checked on Render's Billing page, not guessed at.
- GitHub's rule that disables a schedule after 60 days of inactivity no longer applies to this
  workflow.
- ADR-0186's minute arithmetic, the build filter and the wait-then-purge mechanics stand; only
  its four-a-day train and the six-hour bound are replaced.

## Amendment 2026-11-27

The dispatch rule survives the host: a merge ships nothing, and the person who wants a commit
served dispatches `Publish origin image` and then runs `deploy.sh` on the box. `deploy.yml` —
the Render hook and the wait for its build — is deleted; what is left of it is
`.github/workflows/purge-cache.yml`, the zone purge and the discovery-document check, which is
still a hand dispatch.

## Second amendment 2026-11-27

The dispatch carries the whole deploy again, so the rule costs one click instead of three steps.
`Publish origin image` gained a `deploy` job and a `purge` job: it pulls the image it just built
through `deploy/vps/deploy.sh`, refuses to go green unless `/api/version` answers with the commit it
built, then calls `purge-cache.yml` as a reusable workflow. `-f deploy=false` keeps the publish-only
door, and `Purge the edge` stays dispatchable alone.

The decision is unchanged: a merge ships nothing, and the person who wants a commit served is the
person who dispatches it. What did change is that a credential can restart production with no human on
the box, so the key is narrower than a login — a forced command, no PTY, and one sudoers entry for
`deploy.sh` — and the workflow never gets a shell. Rollback stays manual for the same reason it stays
a tag: a dispatch re-tags `:latest` with the commit it built, so a pinned older image is not something
the job can verify.
