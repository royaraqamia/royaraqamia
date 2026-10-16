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
| `npm run check:migrations`                  | Migration drift check: `supabase/migrations/` vs the linked project (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`; see `docs/supabase.md`). Also the `Migration Drift` workflow                                                                                                          |
| `npm run check:migrations:safety`           | Vets the migrations the project has not recorded, and refuses the destructive ones: what the workflow runs before applying anything unattended (ADR 0041)                                                                                                                                          |
| `npm run perf:baseline`                     | Shipped-weight report + budget status (needs `npm run build`; see `docs/performance.md`)                                                                                                                                                                                                           |
| `npm run perf:check`                        | Same, but exits 1 on a budget breach (run in CI)                                                                                                                                                                                                                                                   |
| `npm run perf:baseline:update`              | Re-record `perf/baseline.json` after an intended change                                                                                                                                                                                                                                            |
| `npm run prune:deployments -- --dry-run`    | List the Vercel deployments a prune would delete (see `docs/vercel-usage.md`)                                                                                                                                                                                                                      |
| `npm run version:next`                      | Version next rehearsal                                                                                                                                                                                                                                                                             |
| `npm run android:apk`                       | Debug APK (syncs the native project first) — see `docs/mobile/android-shell.md`                                                                                                                                                                                                                    |
| `npm run android:test`                      | The shell's JVM unit tests: the update decision and the download — no device needed (ADR-0043, ADR-0044)                                                                                                                                                                                           |
| `npm run android:shell-version`             | Read the shell's version counter and its derived name; `-- --bump` moves both, `-- --check <ref>` is what CI runs (ADR-0043, ADR-0046)                                                                                                                                                             |
| `npm run android:release`                   | Signed release APK                                                                                                                                                                                                                                                                                 |
| `npm run android:publish`                   | The release APK + `public/android/latest.json` stamped from the file itself, uploaded to the storage bucket the site serves from and to its own release `android-<version>`; `--verdict` asks whether there is anything to publish, `--json` is how `Shell Release` runs it (ADR-0044 to ADR-0047) |
| `npm run android:aab`                       | Signed App Bundle for a Play upload                                                                                                                                                                                                                                                                |

`Shell Release` (`.github/workflows/shell-release.yml`) publishes on any push to `main` that touches the
shell: verdict, JVM tests, signed build, asset, re-download check, manifest commit. Only `main` publishes;
a manual dispatch with `dry_run` builds and signs without touching the release. See
`docs/mobile/android-shell.md`.

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
- `npx playwright test --grep responsive` — viewport suite
- `CI=true SW_UPDATE_E2E=1 npx playwright test e2e/sw-update.spec.ts` — worker-swap guard
  (ADR-0039; needs a production build, which `CI=true` makes Playwright perform). It also runs in
  the `E2E: Worker Swap` workflow, on pull requests that touch the worker, the update watcher or
  `generate-icons.mjs`. Note that `CI=true` also makes `prebuild` write
  `backend/config/generated/app-version.ts`; restore it (`git checkout -- backend/config/generated`) before committing.

## Load testing

- `npm run load-test -- --url <endpoint> --concurrency 100 --total 200` — concurrency smoke test for `POST /api/training/applications`. Writes real rows and triggers notifications, so target a preview deployment backed by a throwaway database; production is refused unless `--allow-prod` is passed.

## Agent workflows

Four `.github/workflows` drive the OpenCode agent (DeepSeek 4.1 Flash):

| Workflow                      | Trigger                                                    | What it does                                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue-planner.yml`           | pg_cron 03:00 UTC (primary), daily 03:00 UTC + dispatch    | Scans the codebase, de-dupes against all open issues/PRs, files up to 5 fully-specified issues labelled `ready-for-agent` + `opencode:planned`                                                                                   |
| `issue-implementer.yml`       | dispatched by the planner, daily 06:00 UTC + dispatch      | Claims the oldest `ready-for-agent` issue that is unassigned and not in an open PR, implements it, opens a PR with `Closes #<n>` and merges it once its checks are green; on failure swaps `ready-for-agent` → `ready-for-human` |
| `issue-automation-health.yml` | daily 12:00 UTC + dispatch                                 | Dead-man's switch: re-dispatches a workflow whose heartbeat lapsed and opens/closes an `opencode:alert` issue                                                                                                                    |
| `opencode.yml`                | `/oc <task>` or `/opencode <task>` comment on any issue/PR | Interactive: plans then implements the requested task, opens a PR and merges it once its checks are green (write access only)                                                                                                    |

`ready-for-agent` is the trust boundary — only maintainers and the planner apply it. The workflows create the `opencode:planned`, `opencode:in-progress`, `opencode` and `opencode:alert` labels themselves; agent PRs are tagged `opencode` and their titles normalized to Conventional Commits. Because GitHub's `schedule` is best-effort, the pipeline is driven by a punctual pg_cron dispatch (`dispatch_github_workflow`), chained by the planner dispatching the implementer, caught up by the health workflow, and guarded to one run a day. Both agent workflows land their own pull request — the loop a person runs by hand, with the merge kept in the workflow rather than in the agent: [ADR 0048](adr/0048-the-implementer-merges-its-own-pull-request.md) for the implementer, and [ADR 0049](adr/0049-the-interactive-agent-merges-its-own-pull-request.md) for `/oc`, which names its pull request by the head commit its run moved because its runs are not serialized. Rationale: [ADR 0026](adr/0026-autonomous-issue-planner-and-implementer.md) and [ADR 0032](adr/0032-scheduled-agent-automation-is-externally-triggered.md).

## Deployment

**Primary path:** Push to `main` → CI runs code-quality checks → `.github/workflows/release.yml` (gated: push on `main`) → bump/tag/`chore(release)` commit `[skip ci]` → Vercel auto-deploys.

**The train is watched:** `.github/workflows/release-health.yml` asks `scripts/release-health.mjs` every fifteen minutes whether `main` has commits owing a version — and that have been owed for more than thirty minutes — and opens (or closes) one `release:alert` issue if it does. A release run that lost the race to a newer commit skips green instead of failing, which is why something has to notice a version nobody cut (ADR-0052).

**Manual override:** `vercel deploy` (preview) or `vercel deploy --prod` (production). Or use the `deploy-to-vercel` skill.

**Linked project:** Use `vercel create_git_project` for repo-linked auto-deploys.

**Retained deployments:** Hobby charges Deployment Storage and Functions Storage
across _all_ retained deployments and never prunes them, so
`.github/workflows/prune-deployments.yml` deletes everything but the newest 25
weekly. Budget, measurements and levers: `docs/vercel-usage.md`.

## Release versioning

- **Scheme:** `<X.Y.Z>+build.<N>.<7-char-sha>`
- Core `X.Y.Z` from committed `package.json#version`
- `N` = commits since last tag
- **Bump rules:** breaking/`!` → major, `feat` → minor, anything else → patch
- **Base:** the higher of the last tag reachable from `HEAD` and the highest tag that exists — a number a tag already owns is never re-cut, reachable or not (ADR-0051).
- **Generated module:** `backend/config/generated/app-version.ts` — regenerated by `prebuild`/`predev` on CI only. Do not hand-edit.
- **Never edit** `scripts/compute-version.mjs` or `scripts/release-tools.mjs` without updating co-located tests in `scripts/__tests__/`.
