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
| `npm run perf:baseline`                     | Shipped-weight report + budget status (needs `npm run build`; see `docs/performance.md`)                                                                                                                                                                                                           |
| `npm run perf:check`                        | Same, but exits 1 on a budget breach (run in CI)                                                                                                                                                                                                                                                   |
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

Field Web Vitals from Vercel Speed Insights (p75, last 7 days). Budget and
ceilings: `perf/runtime-budget.json`, explained in `docs/performance.md`.

```bash
npx vercel metrics vercel.speed_insights.inp_ms  --aggregation p75 --since 7d --project royaraqamia --prod
npx vercel metrics vercel.speed_insights.lcp_ms  --aggregation p75 --since 7d --project royaraqamia --prod
npx vercel metrics vercel.speed_insights.cls     --aggregation p75 --since 7d --project royaraqamia --prod
npx vercel metrics vercel.speed_insights.ttfb_ms --aggregation p75 --since 7d --project royaraqamia --prod
```

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

## Load testing

- `npm run load-test -- --url <endpoint> --concurrency 100 --total 200` — concurrency smoke test for `POST /api/training/applications`. Writes real rows and triggers notifications, so point it at a local app backed by a throwaway database; production is refused unless `--allow-prod` is passed.

## Agent workflows

Four `.github/workflows` drive the OpenCode agent (DeepSeek 4.1 Flash):

| Workflow                      | Trigger                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue-planner.yml`           | pg_cron 03:00 UTC (primary), daily 03:00 UTC + dispatch    | Scans and de-dupes against all open issues/PRs, then files at most 3 findings, each carrying the command and output that reproduced it (`## Evidence`). It has the full test toolchain (Chromium, JDK 21, Android SDK) so a UI or gate claim is measured, and `contents: read` so it can never push. Labels `ready-for-agent` + `opencode:planned`                                                                                                                                                                                                            |
| `issue-implementer.yml`       | dispatched by the planner, daily 06:00 UTC + dispatch      | Six rounds a day, one after another: claims the unblocked `ready-for-agent` issue the plan puts first, implements it on a branch cut from the live `main`, opens a PR with `Closes #<n>`, watches its checks and squash-merges it when they are green (`--match-head-commit`, ADR 0120). A red round is repaired once on the PR's own branch, its conflict with `main` included. Nothing is swapped to `ready-for-human`: an issue that did not land stays in the agent's queue                                                                               |
| `pr-land.yml`                 | every 30 min + dispatch, one run per open `opencode/*` PR  | The net under the implementer: while no implementer run is in flight, drives every open `opencode/*` pull request to green and squash-merges it. One attempt per run — watch, repair once (conflict with `main` included), watch again — because the next sweep is 30 minutes away. Five failed attempts label the PR `opencode:stuck` and leave it for a person. Its repair push is authenticated with `AGENT_PUSH_TOKEN` (a PAT with `Contents: Read and write` only), since a `GITHUB_TOKEN` push starts no workflow and would leave the repair unmeasured |
| `issue-automation-health.yml` | every 6h + dispatch                                        | Dead-man's switch: re-dispatches a workflow whose heartbeat lapsed or whose most recent run failed (a transient upstream refusal is retried within six hours rather than a day), confirms the run actually started, and opens/closes an `opencode:alert` issue only for the heartbeat condition                                                                                                                                                                                                                                                               |
| `opencode.yml`                | `/oc <task>` or `/opencode <task>` comment on any issue/PR | Interactive: plans then implements the requested task, opens a PR and watches/reports its checks (write access only); the merge is the owner's manual step                                                                                                                                                                                                                                                                                                                                                                                                    |

`ready-for-agent` is the trust boundary — only maintainers and the planner apply it. The workflows create the `opencode:planned`, `opencode:in-progress`, `opencode` and `opencode:alert` labels themselves; agent PRs are tagged `opencode` and their titles normalized to Conventional Commits. Because GitHub's `schedule` is best-effort, the pipeline is driven by a punctual pg_cron dispatch (`dispatch_github_workflow`), chained by the planner dispatching the implementer, caught up by the health workflow, and guarded to one run a day — a run that carries six issues, one after another. A session and `/oc` stop at the open pull request: they commit, push, open the PR and report its checks, but never merge, because the merge is the repository owner's manual step ([ADR 0066](adr/0066-agents-stop-at-the-open-pull-request.md), superseding [ADR 0048](adr/0048-the-implementer-merges-its-own-pull-request.md) and [ADR 0049](adr/0049-the-interactive-agent-merges-its-own-pull-request.md)). The Issue Implementer is the one exception: it squash-merges its own pull request once every check on it is green ([ADR 0120](adr/0120-the-implementer-merges-its-own-green-pull-request.md)), and takes its order from the issues' blocker edges and `docs/mobile/parity-plan.json` rather than from the lowest number. `/oc` names its pull request by the head commit its run moved because its runs are not serialized. Rationale: [ADR 0026](adr/0026-autonomous-issue-planner-and-implementer.md) and [ADR 0032](adr/0032-scheduled-agent-automation-is-externally-triggered.md).

## Deployment

**Primary path:** Push to `main` → CI runs code-quality checks → Render's Git integration deploys it. There is no release workflow, tag or GitHub Release for the web (ADR-0090); the deploy identity is the generated `<semver>+build.<N>.<sha>`.

**Render is the origin** ([ADR-0174](adr/0174-the-origin-moves-to-render-while-the-free-caps-bite.md)).
`render.yaml` is the blueprint: a free native-Node service, built with `npm ci && npm run build` and
started with `npm start`, health-checked on `/manifest.json`. Native rather than Docker because the
assistant's roster is read from `.opencode/skills/agency/` at request time. Cloudflare proxies the
custom domain and caches `/_next/static/*`, fonts and images: that caching is what keeps the origin
inside the 5 GB monthly bandwidth allowance, after which a workspace with no payment method is
suspended for the rest of the month.

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

**The edge cache is purged when a deploy lands.** Cloudflare honours the origin's `s-maxage`,
and a prerendered page carries a year of it, so a deploy would otherwise leave the old HTML
in place until someone purged by hand. `.github/workflows/purge-cache.yml` waits for the new
build to answer (`sw-version.js` carries `<semver>-<7-char-sha>`) and then purges the zone
([ADR-0177](adr/0177-the-edge-is-purged-when-a-deploy-lands.md)). It needs
`CLOUDFLARE_API_TOKEN` (Zone → Cache Purge) as a secret and `CLOUDFLARE_ZONE_ID` as a
variable; with the token absent the job fails loudly rather than skipping silently.

**Retained deployments:** Render keeps them for rollback and does not meter deployment
storage, so nothing prunes them — the Vercel-only `prune-deployments.yml` and its script were
deleted with the migration. `docs/vercel-usage.md` is a historical record now.

## Release versioning

- **Web:** no releases (ADR-0090). The deploy identity is `<X.Y.Z>+build.<N>.<7-char-sha>`:
  `X.Y.Z` from the committed `package.json#version` (bumped by hand at a milestone), `N` the commit
  count on the branch, the sha the commit. `backend/config/generated/app-version.ts` is regenerated
  by `prebuild`/`predev` on CI and Vercel only; do not hand-edit it, and Sentry names its release
  after the same generated string.
- **Android:** the shell's version is `1.<minor>.<patch>`, graded from the batch the cut releases
  (`!` → major, `feat` → minor, else patch). Its `versionCode` is
  `20000 + (major-1)*10000 + minor*100 + patch`, so it only ever goes up. Both lines live in
  `android/shell-version.properties` and are written by the cut, never by a pull request;
  `scripts/android-shell-version.mjs` owns the arithmetic and fails a hand-edited file.
- **Notes:** a shell change carries an Arabic note under `android/release-notes/unreleased/`; the
  cut freezes it into `android/release-notes/<version>.md` and `public/android/changelog.json`.
- **Never edit** `scripts/compute-version.mjs`, `scripts/android-shell-version.mjs` or
  `scripts/android-release.mjs` without updating co-located tests in `scripts/__tests__/`.
