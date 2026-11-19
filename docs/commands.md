# Commands & Deployment

## Development commands

| Command                                     | Purpose                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                    | Install deps (clean install)                                                                                                                                                                                                                                                                       |
| `npx tsc --noEmit`                          | Type check                                                                                                                                                                                                                                                                                         |
| `npm run lint` / `npm run lint:fix`         | ESLint / auto-fix                                                                                                                                                                                                                                                                                  |
| `npx prettier --check .` / `npm run format` | Format check / write                                                                                                                                                                                                                                                                               |
| `npm test`                                  | Unit tests (Vitest, single run)                                                                                                                                                                                                                                                                    |
| `npm run test:watch`                        | Unit tests (watch mode)                                                                                                                                                                                                                                                                            |
| `npx vitest run <path>`                     | Single test file                                                                                                                                                                                                                                                                                   |
| `npm run build`                             | Full build (wasm engine → icons → version → tsc → next build). Requires `NEXT_PUBLIC_WHATSAPP_PHONE`                                                                                                                                                                                               |
| `npm run check:env-docs`                    | Env docs check                                                                                                                                                                                                                                                                                     |
| `npm run check:runner-permissions`          | Proves no permission prompt is reachable in a headless run: replays OpenCode's last-match-wins evaluation against the CLI's defaults and fails on an `ask` (ADR-0142). Also the `Code Quality` workflow                                                                                            |
| `npm run check:arabic`                      | Arabic spelling and diacritic order: source and docs are NFC and write «جاري» with a final ya, so one word cannot be spelled two ways (`npm run fix:arabic` rewrites). Also the `Code Quality` workflow (ADR 0063)                                                                                 |
| `npm run check:migrations`                  | Migration drift check: `supabase/migrations/` vs the linked project (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`; see `docs/supabase.md`). Also the `Migration Drift` workflow                                                                                                          |
| `npm run check:migrations:safety`           | Vets the migrations the project has not recorded, and refuses the destructive ones: what the workflow runs before applying anything unattended (ADR 0041)                                                                                                                                          |
| `npm run embeddings:backfill`               | Embeds the saved facts that have no vector, or a vector older than the fact: batched, idempotent and resumable (`--batches`, `--batch`). Empty `AI_EMBEDDING_MODEL` reports the queue and writes nothing, so recall stays lexical (ADR-0185, #1425)                                                |
| `npm run perf:baseline`                     | Shipped-weight report + budget status (needs `npm run build`; see `docs/performance.md`)                                                                                                                                                                                                           |
| `npm run perf:check`                        | Same, but exits 1 on a budget breach (run in CI)                                                                                                                                                                                                                                                   |
| `npm run check:edge`                        | Edge cache: public paths are `HIT`, private paths are never cached — see `docs/edge-cache.md`                                                                                                                                                                                                      |
| `npm run perf:baseline:update`              | Re-record `perf/baseline.json` after an intended change                                                                                                                                                                                                                                            |
| `npm run android:apk`                       | Debug APK (syncs the native project first) — see `docs/mobile/android-shell.md`                                                                                                                                                                                                                    |
| `npm run android:test`                      | The shell's JVM unit tests: the update decision and the download — no device needed (ADR-0043, ADR-0044)                                                                                                                                                                                           |
| `npm run android:launch`                    | The app's own first frame on an attached device: cold and warm `am start -W` runs against the 400/300 ms budgets, `--device`, `--runs`, `--no-budget` — see `docs/mobile/native-app.md`                                                                                                            |
| `npm run android:crash-drill`               | Crashes a debug build on purpose, then reads the report it queued back over adb - see `docs/mobile/crash-reports.md`                                                                                                                                                                               |
| `npm run android:profile`                   | Regenerates the shell's own baseline profile on the managed emulator and copies it into `android/app/src/release/generated/baselineProfiles/`; commit the result — see `docs/mobile/native-app.md`                                                                                                 |
| `npm run android:shell-version`             | Read the shell's version; `-- --bump [--major\|--minor\|--patch]` writes one by hand, `-- --check <ref>` is what CI runs (ADR-0043, ADR-0090)                                                                                                                                                      |
| `npm run android:release-plan`              | What the next Android cut would release now, and why — read-only (ADR-0090)                                                                                                                                                                                                                        |
| `npm run android:release`                   | Signed release APK                                                                                                                                                                                                                                                                                 |
| `npm run android:publish`                   | The release APK + `public/android/latest.json` stamped from the file itself, uploaded to the storage bucket the site serves from and to its own release `android-<version>`; `--verdict` asks whether there is anything to publish, `--json` is how `Shell Release` runs it (ADR-0044 to ADR-0047) |
| `npm run android:aab`                       | Signed App Bundle for a Play upload                                                                                                                                                                                                                                                                |

`Android Release` (`.github/workflows/android-release.yml`) publishes one APK for the whole batch of
native changes, and only when it is dispatched by hand — it has no schedule (ADR-0090 amendment). It
grades the batch, folds the notes, runs the JVM tests, builds and signs, uploads the asset, downloads
and hashes it, creates the release, and commits the version, the notes, the changelog and the manifest
together. With no native change since the last release a dispatch publishes nothing. See
`docs/mobile/android-shell.md`.

`News Source Smoke` (`.github/workflows/news-source-smoke.yml`) is the one job that writes to the
deployment on purpose: it signs up two disposable readers, exercises the private-source RPCs, the plan
cap and the RLS policies through the real API, and deletes them. Run it after a migration that touches
news sources lands — `gh workflow run 'News Source Smoke' -f confirm=run` (ADR-0106).

## Runtime metrics

Field Web Vitals have no reporter at the moment: Vercel Speed Insights went with
the origin move to Render (ADR-0174, #1498). Budget and ceilings stay where they
were — `perf/runtime-budget.json`, explained in `docs/performance.md`.

## E2E tests

- `npm run test:e2e` — Playwright (needs `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`)
- `PUBLIC_OFFLINE_E2E=1 npx playwright test e2e/responsive-offline.spec.ts` — offline breakpoint
  matrix (320/375/428/768 px, one Playwright project each; needs `npm run build && npm run start`)
- `CI=true SW_UPDATE_E2E=1 npx playwright test e2e/sw-update.spec.ts` — worker-update channel
  (ADR-0134, ADR-0171; needs a production build, which `CI=true` makes Playwright perform). It also runs in
  the `E2E: Worker Swap` workflow, on pull requests that touch the worker, the update watcher or
  `generate-icons.mjs`. Note that `CI=true` also makes `prebuild` write
  `backend/config/generated/app-version.ts`; restore it (`git checkout -- backend/config/generated`) before committing.
- `npx playwright test e2e/visual-baseline.spec.ts` — what the generated tokens resolve to in a
  browser, against `e2e/visual-baseline.json` (ADR-0096). `npm run visual:baseline` re-records it
  after an intended change; the `Visual Baseline` workflow runs it on pull requests that touch the
  tokens, the stylesheets that consume them or the sura index.
- `npm run check:visual` — the gate a native port passes before it is switched on (ADR-0118): the
  layout contract and the raster of `docs/mobile/visual-gate.json`'s surfaces, compared against the
  evidence in `e2e/__visual__/`. A surface switched on in `docs/mobile/screens.json` without a
  passing pair fails here. Every contract in `shared/visual` must also carry a `motion` section (what
  moves, on which gesture, and what "the same" means for it, or why nothing moves); a contract without
  one fails and is named. `npm run visual:capture` records the page side of every gated surface at the
  app's viewport (393 x 852, DPR 2.75, Arabic, dark); the app's own Robolectric test writes the
  screen side. The capture signs in as the gate's own fixture account (`E2E_VISUAL_EMAIL` /
  `E2E_VISUAL_PASSWORD`), never the offline suite's shared account, and provisions it first with
  `e2e/setup-test-user.ts --visual --reset` (or `npm run visual:account` on its own). Without the
  pair the capture skips with a message naming both variables and writes no evidence, so a missing
  account is a state declared and not captured rather than a recording of the wrong member (#920).

- `npm run check:visual-drift -- --base <ref>` — the pull-request companion to `check:visual`. It reads
  the diff against the base and refuses a change to a gated surface's web component, route, copy or
  contract unless the same pull request re-records that surface's evidence, or carries a dated waiver
  from `docs/mobile/visual-waivers.json`. It is scoped to the diff, so the old-evidence backlog in
  #1631 does not fail unrelated pull requests (docs/mobile/visual-drift.md).

## Load testing

- `npm run load-test -- --url <endpoint> --concurrency 100 --total 200` — concurrency smoke test for `POST /api/training/applications`. Writes real rows and triggers notifications, so point it at a local app backed by a throwaway database; production is refused unless `--allow-prod` is passed.

## Agent workflows

Ten `.github/workflows` drive the OpenCode agent (DeepSeek 4.1 Flash): six audits, the implementer, the landing net, the health monitor and the interactive door.

| Workflow                      | Trigger                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-*.yml` (6)             | pg_cron 10:10-15:10 UTC (primary), same GitHub schedule    | Six specialised auditors (performance, security, UI/UX, scalability, maintainability, product). Each reviews the whole codebase in its domain on both web and Android, verifies every finding with real evidence, and files **exactly three** issues a day — one dated report plus two findings or clean-area reports. No implementation, commits or PRs. Full toolchain (Chromium, JDK 21, Android SDK), read-only Supabase/Render, no Vercel. Labels `opencode:audit` + `audit:<domain>`; nothing is labelled `ready-for-agent` automatically (ADR 0208)    |
| `issue-implementer.yml`       | daily 12:45 UTC + dispatch                                 | Three rounds a day, one after another: claims the unblocked `ready-for-agent` issue the plan puts first, implements it on a branch cut from the live `main`, opens a PR with `Closes #<n>`, watches its checks and squash-merges it when they are green (`--match-head-commit`, ADR 0120). A red round is repaired once on the PR's own branch, its conflict with `main` included. Only a human applies `ready-for-agent` to an audit finding                                                                                                                 |
| `pr-land.yml`                 | every 30 min + dispatch, one run per open `opencode/*` PR  | The net under the implementer: while no implementer run is in flight, drives every open `opencode/*` pull request to green and squash-merges it. One attempt per run — watch, repair once (conflict with `main` included), watch again — because the next sweep is 30 minutes away. Five failed attempts label the PR `opencode:stuck` and leave it for a person. Its repair push is authenticated with `AGENT_PUSH_TOKEN` (a PAT with `Contents: Read and write` only), since a `GITHUB_TOKEN` push starts no workflow and would leave the repair unmeasured |
| `issue-automation-health.yml` | every 6h + dispatch                                        | Dead-man's switch: re-dispatches a workflow whose heartbeat lapsed or whose most recent run failed (a transient upstream refusal is retried within six hours rather than a day), confirms the run actually started, and opens/closes an `opencode:alert` issue only for the heartbeat condition                                                                                                                                                                                                                                                               |
| `opencode.yml`                | `/oc <task>` or `/opencode <task>` comment on any issue/PR | Interactive: plans then implements the requested task, opens a PR and watches/reports its checks (write access only); the merge is the owner's manual step                                                                                                                                                                                                                                                                                                                                                                                                    |

`ready-for-agent` is the trust boundary — only a maintainer applies it; the audit workflows deliberately do not. The workflows create the `opencode:audit`, `audit:<domain>`, `opencode:in-progress`, `opencode` and `opencode:alert` labels themselves; agent PRs are tagged `opencode` and their titles normalized to Conventional Commits. Because GitHub's `schedule` is best-effort, the pipeline is driven by punctual pg_cron dispatches (`dispatch_github_workflow`), caught up by the health workflow, and guarded by the number of issues actually filed today rather than by a run's success. A session and `/oc` stop at the open pull request: they commit, push, open the PR and report its checks, but never merge, because the merge is the repository owner's manual step ([ADR 0066](adr/0066-agents-stop-at-the-open-pull-request.md), superseding [ADR 0048](adr/0048-the-implementer-merges-its-own-pull-request.md) and [ADR 0049](adr/0049-the-interactive-agent-merges-its-own-pull-request.md)). The Issue Implementer is the one exception: it squash-merges its own pull request once every check on it is green ([ADR 0120](adr/0120-the-implementer-merges-its-own-green-pull-request.md)), and takes its order from the issues' blocker edges and `docs/mobile/parity-plan.json` rather than from the lowest number. `/oc` names its pull request by the head commit its run moved because its runs are not serialized. Rationale: [ADR 0026](adr/0026-autonomous-issue-planner-and-implementer.md) and [ADR 0032](adr/0032-scheduled-agent-automation-is-externally-triggered.md).

## Deployment

**Primary path:** A push to `main` runs CI. The origin does not deploy on that push:
`.github/workflows/deploy.yml` calls Render's deploy hook only when someone dispatches it by hand on
`main` (ADR-0209). There is no release workflow, tag or GitHub Release for the web (ADR-0090); the
deploy identity is the generated `<semver>+build.<N>.<sha>`.

**Why a hand dispatch.** Hobby includes 500 build-pipeline minutes a month. At the recorded cadence
(~22 deploy-triggering merges a day, ~2m45 a build) a deploy on every push would be ~1,800 minutes,
and the four-a-day train of ADR-0186 spent ~330 of the 500 at that cadence, shipping whatever was on
`main` at four fixed hours. A dispatch spends a build only when a deploy is wanted, and leaves what
goes live to the person who runs it. Time-to-production is no longer bounded by a clock: a merge stays undeployed until someone
dispatches the workflow. A dispatch whose commit is already serving costs nothing: the workflow
reads the running build's `<7-char-sha>` from `sw-version.js` and stops before calling the hook. A
dispatch also takes **`purge_only`**, which skips the build and re-runs the discovery check and the
purge — the recovery for a purge that failed after a build had already landed.

**Render is the origin** ([ADR-0174](adr/0174-the-origin-moves-to-render-while-the-free-caps-bite.md)).
`render.yaml` is the blueprint: a free native-Node service, built with `npm ci && npm run build:render`
and started with `npm start`, health-checked on `/manifest.json`, with `autoDeployTrigger: 'off'` so
only a dispatch deploys. `build:render` is `npm run build` without `tsc --noEmit` — the pull request
already gates types — so the build machine spends its minutes on the artifact, not a second type
check. Native rather than Docker because the assistant's roster is read from
`.opencode/skills/agency/` at request time. Cloudflare proxies the custom domain and caches
`/_next/static/*`, fonts and images: that caching is what keeps the origin inside the 5 GB monthly
bandwidth allowance, after which a workspace with no payment method is suspended for the rest of the
month. The deploy needs `RENDER_DEPLOY_HOOK_URL` as an Actions secret (Render → service → Settings →
Deploy Hook); with it absent the workflow fails loudly rather than skipping silently.

**Crons are GitHub Actions, not the platform.** `.github/workflows/scheduled-jobs.yml` calls the
three routes on their old schedules; each route authorises itself from
`Authorization: Bearer $CRON_SECRET`, so a manual run needs no CLI:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://royaraqamia.com/api/rates/refresh
```

**Vercel is configured but paused** — Fluid Active CPU, 5h 06m against a 4h allowance, until
2026-12-12. `vercel.json` still carries the project's region and `_next/static` header so the
deployment can be resumed without a revert, but it no longer owns the crons: running both would
double every job. Manual override if resumed: `vercel deploy --prod`.

**The Android cut is manual, and unwatched:** nothing opens an issue about releases. The owner
dispatches `Android Release` when the batch should ship; a dispatch with no native change publishes
nothing, and a failed run is re-runnable from the Actions page (ADR-0090 amendment).

**The edge cache is purged when a deploy lands.** Cloudflare honours the origin's `s-maxage`, and a
prerendered page carries a year of it, so a deploy would otherwise leave the old HTML in place until
someone purged by hand. The deploy job waits for the new build to answer (`sw-version.js` carries
`<semver>-<7-char-sha>`) and then purges the zone
([ADR-0177](adr/0177-the-edge-is-purged-when-a-deploy-lands.md)). It needs `CLOUDFLARE_API_TOKEN`
(Zone → Cache Purge) as a secret and `CLOUDFLARE_ZONE_ID` as a variable; with the token absent the
job fails loudly rather than skipping silently. `purge-cache.yml` no longer exists: the purge is a
step of the deploy the workflow runs by hand
([ADR-0186](adr/0186-the-origin-deploys-on-a-clock-not-on-every-merge.md),
[ADR-0209](adr/0209-the-origin-deploys-only-when-dispatched.md)).

**The edge caches the public document.** The four Cache Rules and the warm Worker are in
[edge-cache.md](edge-cache.md); `npm run check:edge` asserts the public documents and the explicit
public API reads are `HIT` and the member surfaces are not
([ADR-0187](adr/0187-the-edge-caches-the-public-document-and-a-cron-keeps-the-origin-awake.md)).

**The free instance has a 512 MB memory budget.** The upload and document caps are in
[memory-budget.md](memory-budget.md); an OOM restart or a memory graph above roughly 350 MB is the
trigger for the `1c-2g` ($25) compute plan
([ADR-0189](adr/0189-the-free-instance-has-a-memory-budget.md)). The runtime heap is capped at
384 MB in `render.yaml` and the build keeps its own 6 GB, so a V8 failure is a logged error instead
of a container kill, and every start and every five minutes the process writes a `[boot]` or
`[memory]` line to the service log
([ADR-0199](adr/0199-the-heap-cap-belongs-to-the-build-and-a-restart-leaves-a-line.md)).

**Retained deployments:** Render keeps them for rollback and does not meter deployment
storage, so nothing prunes them — the Vercel-only `prune-deployments.yml` and its script were
deleted with the migration. `docs/vercel-usage.md` is a historical record now.

**Workflow runs are pruned by a clock.** The repository's retention setting expires logs, artifacts
and check data but never the run itself, so `.github/workflows/prune-runs.yml` deletes completed runs
older than two days at 02:20 UTC — oldest first, capped at 800 a day by the installation token's
1,000-requests-an-hour budget, and never a run that is not `completed`
([ADR-0204](adr/0204-the-run-list-is-pruned-by-a-clock.md)). A backlog converges over the following
days instead of failing the job; `npm run prune:runs -- --dry-run` is the local read of the same
script.

## Release versioning

- **Web:** no releases (ADR-0090). The deploy identity is `<X.Y.Z>+build.<N>.<7-char-sha>`:
  `X.Y.Z` from the committed `package.json#version` (bumped by hand at a milestone), `N` the commit
  count on the branch, the sha the commit. `backend/config/generated/app-version.ts` is regenerated
  by `prebuild`/`predev` on every build host — GitHub Actions, Vercel and Render — and skipped on a
  local run (override with `APP_VERSION_WRITE=force`); do not hand-edit it, and Sentry names its
  release after the same generated string.
- **Android:** the shell's version is `1.<minor>.<patch>`, graded from the batch the cut releases
  (`!` → major, `feat` → minor, else patch). Its `versionCode` is
  `20000 + (major-1)*10000 + minor*100 + patch`, so it only ever goes up. Both lines live in
  `android/shell-version.properties` and are written by the cut, never by a pull request;
  `scripts/android-shell-version.mjs` owns the arithmetic and fails a hand-edited file.
- **Notes:** a shell change carries an Arabic note under `android/release-notes/unreleased/`; the
  cut freezes it into `android/release-notes/<version>.md` and `public/android/changelog.json`.
- **Never edit** `scripts/compute-version.mjs`, `scripts/android-shell-version.mjs` or
  `scripts/android-release.mjs` without updating co-located tests in `scripts/__tests__/`.
