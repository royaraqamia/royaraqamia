# Commands & Deployment

## Development commands

| Command                                     | Purpose                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm ci`                                    | Install deps (clean install)                                                             |
| `npx tsc --noEmit`                          | Type check                                                                               |
| `npm run lint` / `npm run lint:fix`         | ESLint / auto-fix                                                                        |
| `npx prettier --check .` / `npm run format` | Format check / write                                                                     |
| `npm test`                                  | Unit tests (Vitest, single run)                                                          |
| `npm run test:watch`                        | Unit tests (watch mode)                                                                  |
| `npx vitest run <path>`                     | Single test file                                                                         |
| `npm run build`                             | Full build (icons → version → tsc → next build). Requires `NEXT_PUBLIC_WHATSAPP_PHONE`   |
| `npm run check:env-docs`                    | Env docs check                                                                           |
| `npm run perf:baseline`                     | Shipped-weight report + budget status (needs `npm run build`; see `docs/performance.md`) |
| `npm run perf:check`                        | Same, but exits 1 on a budget breach (run in CI)                                         |
| `npm run perf:baseline:update`              | Re-record `perf/baseline.json` after an intended change                                  |
| `npm run version:next`                      | Version next rehearsal                                                                   |

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

## Load testing

- `npm run load-test -- --url <endpoint> --concurrency 100 --total 200` — concurrency smoke test for `POST /api/training/applications`. Writes real rows and triggers notifications, so target a preview deployment backed by a throwaway database; production is refused unless `--allow-prod` is passed.

## Agent workflows

Three `.github/workflows` drive the OpenCode agent (DeepSeek 4.1 Flash):

| Workflow                | Trigger                                                    | What it does                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issue-planner.yml`     | daily 03:00 UTC + dispatch                                 | Scans the codebase, de-dupes against all open issues/PRs, files up to 5 fully-specified issues labelled `ready-for-agent` + `opencode:planned`                                           |
| `issue-implementer.yml` | daily 06:00 UTC + dispatch                                 | Claims the oldest `ready-for-agent` issue that is unassigned and not in an open PR, implements it, opens a PR with `Closes #<n>`; on failure swaps `ready-for-agent` → `ready-for-human` |
| `opencode.yml`          | `/oc <task>` or `/opencode <task>` comment on any issue/PR | Interactive: plans then implements the requested task and opens a PR (write access only)                                                                                                 |

`ready-for-agent` is the trust boundary — only maintainers and the planner apply it. The workflows create the `opencode:planned`, `opencode:in-progress` and `opencode` labels themselves; agent PRs are tagged `opencode` and their titles normalized to Conventional Commits. Rationale: [ADR 0026](adr/0026-autonomous-issue-planner-and-implementer.md).

## Deployment

**Primary path:** Push to `main` → CI runs code-quality checks → `.github/workflows/release.yml` (gated: push on `main`) → bump/tag/`chore(release)` commit `[skip ci]` → Vercel auto-deploys.

**Manual override:** `vercel deploy` (preview) or `vercel deploy --prod` (production). Or use the `deploy-to-vercel` skill.

**Linked project:** Use `vercel create_git_project` for repo-linked auto-deploys.

## Release versioning

- **Scheme:** `<X.Y.Z>+build.<N>.<7-char-sha>`
- Core `X.Y.Z` from committed `package.json#version`
- `N` = commits since last tag
- **Bump rules:** breaking/`!` → major, `feat` → minor, anything else → patch
- **Generated module:** `backend/config/generated/app-version.ts` — regenerated by `prebuild`/`predev` on CI only. Do not hand-edit.
- **Never edit** `scripts/compute-version.mjs` or `scripts/release-tools.mjs` without updating co-located tests in `scripts/__tests__/`.
