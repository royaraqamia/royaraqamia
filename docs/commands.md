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
| `npm run check:arabic`                      | Arabic spelling and diacritic order: source and docs are NFC and write «جاري» with a final ya, so one word cannot be spelled two ways (`npm run fix:arabic` rewrites). Also the `Code Quality` workflow (ADR 0063)                                                                                 |
| `npm run check:migrations`                  | Migration drift check: `supabase/migrations/` vs the linked project (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`; see `docs/supabase.md`). Also the `Migration Drift` workflow                                                                                                          |
| `npm run check:migrations:safety`           | Vets the migrations the project has not recorded, and refuses the destructive ones: what the workflow runs before applying anything unattended (ADR 0041)                                                                                                                                          |
| `npm run perf:baseline`                     | Shipped-weight report + budget status (needs `npm run build`; see `docs/performance.md`)                                                                                                                                                                                                           |
| `npm run perf:check`                        | Same, but exits 1 on a budget breach (run in CI)                                                                                                                                                                                                                                                   |
| `npm run perf:baseline:update`              | Re-record `perf/baseline.json` after an intended change                                                                                                                                                                                                                                            |
| `npm run prune:deployments -- --dry-run`    | List the Vercel deployments a prune would delete (see `docs/vercel-usage.md`)                                                                                                                                                                                                                      |
| `npm run android:apk`                       | Debug APK (syncs the native project first) — see `docs/mobile/android-shell.md`                                                                                                                                                                                                                    |
| `npm run android:test`                      | The shell's JVM unit tests: the update decision and the download — no device needed (ADR-0043, ADR-0044)                                                                                                                                                                                           |
| `npm run android:drill`                     | The shell's background-drain drill on `Pixel_API_30` or a real device: a write queued with the radio off, the app killed, the worker's line — see `docs/mobile/android-shell.md`                                                                                                                   |
| `npm run android:launch`                    | The app's own first frame on an attached device: cold and warm `am start -W` runs against the 400/300 ms budgets, `--device`, `--runs`, `--no-budget` — see `docs/mobile/native-app.md`                                                                                                            |
| `npm run android:profile`                   | Regenerates the shell's own baseline profile on the managed emulator and copies it into `android/app/src/release/generated/baselineProfiles/`; commit the result — see `docs/mobile/native-app.md`                                                                                                 |
| `npm run android:shell-version`             | Read the shell's version; `-- --bump [--major\|--minor\|--patch]` writes one by hand, `-- --check <ref>` is what CI runs (ADR-0043, ADR-0090)                                                                                                                                                      |
| `npm run android:release-plan`              | What the weekly Android train would release now, and why — read-only (ADR-0090)                                                                                                                                                                                                                    |
| `npm run android:release`                   | Signed release APK                                                                                                                                                                                                                                                                                 |
| `npm run android:publish`                   | The release APK + `public/android/latest.json` stamped from the file itself, uploaded to the storage bucket the site serves from and to its own release `android-<version>`; `--verdict` asks whether there is anything to publish, `--json` is how `Shell Release` runs it (ADR-0044 to ADR-0047) |
| `npm run android:aab`                       | Signed App Bundle for a Play upload                                                                                                                                                                                                                                                                |

`Android Release` (`.github/workflows/android-release.yml`) publishes on a weekly schedule — one
APK for the whole batch of native changes — or on a manual dispatch that cuts the batch now: grade,
notes, JVM tests, signed build, asset, re-download check, release, and one commit carrying the version,
the notes, the changelog and the manifest. A week with no native change publishes nothing. See
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
- `CI=true SW_UPDATE_E2E=1 npx playwright test e2e/sw-update.spec.ts` — worker-swap guard
  (ADR-0039; needs a production build, which `CI=true` makes Playwright perform). It also runs in
  the `E2E: Worker Swap` workflow, on pull requests that touch the worker, the update watcher or
  `generate-icons.mjs`. Note that `CI=true` also makes `prebuild` write
  `backend/config/generated/app-version.ts`; restore it (`git checkout -- backend/config/generated`) before committing.
- `npx playwright test e2e/visual-baseline.spec.ts` — what the generated tokens resolve to in a
  browser, against `e2e/visual-baseline.json` (ADR-0096). `npm run visual:baseline` re-records it
  after an intended change; the `Visual Baseline` workflow runs it on pull requests that touch the
  tokens, the stylesheets that consume them or the sura index.

## Load testing

- `npm run load-test -- --url <endpoint> --concurrency 100 --total 200` — concurrency smoke test for `POST /api/training/applications`. Writes real rows and triggers notifications, so point it at a local app backed by a throwaway database; production is refused unless `--allow-prod` is passed.

## Agent workflows

Four `.github/workflows` drive the OpenCode agent (DeepSeek 4.1 Flash):

| Workflow                      | Trigger                                                    | What it does                                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue-planner.yml`           | pg_cron 03:00 UTC (primary), daily 03:00 UTC + dispatch    | Scans the codebase, de-dupes against all open issues/PRs, files up to 5 fully-specified issues labelled `ready-for-agent` + `opencode:planned`                                                                                                                 |
| `issue-implementer.yml`       | dispatched by the planner, daily 06:00 UTC + dispatch      | Claims the oldest `ready-for-agent` issue that is unassigned and not in an open PR, implements it, opens a PR with `Closes #<n>`, and watches/reports its checks; the merge is the owner's manual step. On failure swaps `ready-for-agent` → `ready-for-human` |
| `issue-automation-health.yml` | every 6h + dispatch                                        | Dead-man's switch: re-dispatches a workflow whose heartbeat lapsed, confirms the run actually started, and opens/closes an `opencode:alert` issue                                                                                                              |
| `opencode.yml`                | `/oc <task>` or `/opencode <task>` comment on any issue/PR | Interactive: plans then implements the requested task, opens a PR and watches/reports its checks (write access only); the merge is the owner's manual step                                                                                                     |

`ready-for-agent` is the trust boundary — only maintainers and the planner apply it. The workflows create the `opencode:planned`, `opencode:in-progress`, `opencode` and `opencode:alert` labels themselves; agent PRs are tagged `opencode` and their titles normalized to Conventional Commits. Because GitHub's `schedule` is best-effort, the pipeline is driven by a punctual pg_cron dispatch (`dispatch_github_workflow`), chained by the planner dispatching the implementer, caught up by the health workflow, and guarded to one run a day. Both agent workflows stop at the open pull request — they commit, push, open the PR and report its checks, but never merge: the merge is the repository owner's manual step ([ADR 0066](adr/0066-agents-stop-at-the-open-pull-request.md), superseding [ADR 0048](adr/0048-the-implementer-merges-its-own-pull-request.md) and [ADR 0049](adr/0049-the-interactive-agent-merges-its-own-pull-request.md)). `/oc` names its pull request by the head commit its run moved because its runs are not serialized. Rationale: [ADR 0026](adr/0026-autonomous-issue-planner-and-implementer.md) and [ADR 0032](adr/0032-scheduled-agent-automation-is-externally-triggered.md).

## Deployment

**Primary path:** Push to `main` → CI runs code-quality checks → Vercel's Git integration deploys it. There is no release workflow, tag or GitHub Release for the web (ADR-0090); the deploy identity is the generated `<semver>+build.<N>.<sha>`.

**The Android train is watched:** `.github/workflows/release-health.yml` asks `scripts/android-release.mjs --health` daily whether native changes have sat unreleased past the weekly cadence — and opens (or closes) one `release:alert` issue if they have. A release that never started, or failed on a build or a missing note, is what that catches (ADR-0090).

**Manual override:** `vercel deploy --prod` (production). There are no preview deployments to produce, so a bare `vercel deploy` is not part of the flow.

**Linked project:** Use `vercel create_git_project` for repo-linked auto-deploys.

**Retained deployments:** Hobby charges Deployment Storage and Functions Storage
across _all_ retained deployments and never prunes them, so
`.github/workflows/prune-deployments.yml` deletes everything but the newest 25
weekly. Budget, measurements and levers: `docs/vercel-usage.md`.

## Release versioning

- **Web:** no releases (ADR-0090). The deploy identity is `<X.Y.Z>+build.<N>.<7-char-sha>`:
  `X.Y.Z` from the committed `package.json#version` (bumped by hand at a milestone), `N` the commit
  count on the branch, the sha the commit. `backend/config/generated/app-version.ts` is regenerated
  by `prebuild`/`predev` on CI and Vercel only; do not hand-edit it, and Sentry names its release
  after the same generated string.
- **Android:** the shell's version is `1.<minor>.<patch>`, graded from the batch the weekly train
  releases (`!` → major, `feat` → minor, else patch). Its `versionCode` is
  `20000 + (major-1)*10000 + minor*100 + patch`, so it only ever goes up. Both lines live in
  `android/shell-version.properties` and are written by the cut, never by a pull request;
  `scripts/android-shell-version.mjs` owns the arithmetic and fails a hand-edited file.
- **Notes:** a shell change carries an Arabic note under `android/release-notes/unreleased/`; the
  cut freezes it into `android/release-notes/<version>.md` and `public/android/changelog.json`.
- **Never edit** `scripts/compute-version.mjs`, `scripts/android-shell-version.mjs` or
  `scripts/android-release.mjs` without updating co-located tests in `scripts/__tests__/`.
