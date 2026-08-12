# Version Number System — Implementation Plan

> Status: **Approved for implementation**
> Stack: Next.js 16 (App Router) · GitHub (main) · Vercel (Git-integration deploys) · Sentry · Supabase
> Companion docs: `README.md`, `AGENTS.md`, `FEATURES-PLAN.md`, `SECURITY.md`

---

## 1. Goal

Give the royaraqamia web app a **production-ready, fully automated release version system**: every merge/commit to `main` produces a unique, monotonic, human-readable version number that users can see — without disturbing the deployment-change **version checker** that already exists.

Two separate things, never mixed:

| Concern                        | What it is                                                                                                   | Who uses it                                                                                                           | Changes?                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Version checker** (existing) | Deployment fingerprint — `VERCEL_DEPLOYMENT_ID \|\| VERCEL_GIT_COMMIT_SHA \|\| NEXT_BUILD_ID \|\| 'unknown'` | Client polls `/api/version`, compares against last-known value, shows the reload popup when the deployed code changed | **No behavioral changes** |
| **Release version** (new)      | Semantic `X.Y.Z` + per-commit build metadata, produced by the release pipeline                               | Users (popup text), API consumers, Sentry, changelog, support/incident correlation                                    | **New**, additive         |

---

## 2. Current state (verified)

- `GET /api/version` → `{ version }` (fingerprint only), served by `backend/controllers/version.ts` backed by `backend/config/env.ts` getter `env.version`.
- Client logic: `frontend/state/use-app-version.ts` (poll 60s + on focus) → `frontend/ui/VersionChecker.tsx` → `frontend/ui/UpdatePopup.tsx`. Single popup, single checker. No duplication intended.
- `package.json#version = "1.0.0"` (vestigial/static — becomes the workflow-maintained source of truth).
- Git: `origin = github.com/royaraqamia/royaraqamia`, branch `main`, annotated tag `v1.0.0` exists (423 commits back), repo history shows **both** PR merges (dependabot) and direct pushes.
- CI: `.github/workflows/code-quality.yml` (prettier → env-docs → lint → tsc → tests → build), full-history checkout.
- Other workflows: `codeql-analysis.yml`, `security-scan.yml` (gitleaks + npm audit).
- **No `CHANGELOG.md`, no release automation, no release workflow exists today.**
- Sentry wired in exactly 3 places: `sentry.server.config.ts`, `sentry.edge.config.ts`, and client init centralized in `frontend/shared/sentry.ts` (`sentry.init({...})`).

---

## 3. Version format

```
<X.Y.Z>+build.<N>.<7-char-sha>
```

| Component | Meaning                                                         | Source (priority order)                                            |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `X.Y.Z`   | SemVer core — the **displayed** release number                  | `APP_VERSION` env override → committed `package.json#version`      |
| `N`       | Commits since the last release tag                              | `git rev-list --count <lastTag>..HEAD` (when git is available)     |
| `<sha>`   | 7-char commit SHA — guarantees per-commit uniqueness everywhere | `VERCEL_GIT_COMMIT_SHA` → `git rev-parse --short HEAD` → `unknown` |

Concrete examples:

- Tagged `main` merge: `1.4.1+build.0.3f9a1b2` → users read **`1.4.1`**
- PR preview / hotfix branch: `1.4.0+build.7.abc1234` → still unique and traceable

Why `+…` build metadata: per SemVer 2.0.0 §10 it is **ignored for precedence**, so it never perturbs version ordering, while still giving every single commit a unique, reproducible identifier. The suffix is a traceability safety net for previews/un-tagged builds; uniqueness never blocks correctness.

**Ownership split (critical):**

- The **core** `X.Y.Z` must NOT depend on git history at Vercel build time. Its source is the committed `package.json#version`, which the release workflow keeps equal to the current tag. Vercel always has `package.json` in its source download.
- Git (tags + counts) is used **only** to (a) compute the _next_ version inside the release workflow (full-history checkout) and (b) build the traceability suffix. Nothing gates correctness on git being present during a Vercel build.

---

## 4. Pipeline (fully automated — a version on every commit)

```
push to main (code)
   │
   ▼
code-quality.yml (CI gates: prettier / env-docs / lint / tsc / tests / build)
   │  (conclusion: success)
   ▼
release.yml  [workflow_run; gated: event==push && head_branch==main]
   │  concurrency-guard + idempotency guard
   │  1. Checkout (fetch-depth: 0, fetch-tags: true)
   │  2. Build-verify: npm run build   ← a broken release is never minted
   │  3. Read latest tag vX.Y.Z
   │  4. Bump from the merged conventional commit:
   │        breaking / '!'  → major (X+1.0.0)
   │        feat            → minor (X.Y+1.0)
   │        anything else   → patch (X.Y.Z+1)
   │  5. Bump package.json#version to match
   │  6. Write CHANGELOG.md (Keep-a-Changelog; grouped feat/fix/style/perf/docs…)
   │  7. Commit  "chore(release): vX.Y.Z [skip ci]"   ← [skip ci] breaks the auto-trigger loop
   │  8. Tag      vX.Y.Z  +  create GitHub Release (notes from the changelog section)
   │
   ▼
Vercel Git integration auto-deploys the release commit
   │  (Vercel deploys [skip ci] commits — GitHub Actions skip, Vercel does not)
   ▼
Vercel build → prebuild → scripts/compute-version.mjs → bakes releaseVersion into the server bundle
   ▼
GET /api/version → { version: <fingerprint unchanged>, releaseVersion: "1.4.1+build.0.3f9a1b2", … }
   ▼
Existing UpdatePopup shows: «تحديث متاح — النسخة الجديدة 1.4.1»
```

**Double-deploy note (accepted):** the original code push deploys, then the `chore(release)` commit deploys again. This is intentional and safe — the release commit becomes the canonical deployed artifact. The alternative (suppressing the first build) is not controllable via Vercel git integration and adds no safety.

---

## 5. Hardening & failure modes (senior-review pass)

Three real production flaws were found during the review and are designed-out:

1. **Infinite release loop** — the `chore(release)` commit would re-trigger `code-quality.yml` → `workflow_run` → `release.yml`.
   - **Fix 1:** commit message contains `[skip ci]` → GitHub Actions do not run for that push, but Vercel still deploys.
   - **Fix 2:** idempotency guard — bail if `HEAD` is already tagged `v*` and the latest commit message starts with `chore(release):`.
   - **Fix 3:** `concurrency: group: release-main` so two near-simultaneous merges cannot race to create the same tag.

2. **`workflow_run` fires for PR runs too** — `code-quality.yml` also runs on `pull_request`.
   - **Fix:** gate the release job with `event == 'push' && head_branch == 'main'`.

3. **Git history is not guaranteed on Vercel's build.**
   - **Fix:** core version comes from the committed `package.json#version` (always present in Vercel's source download); git is never load-bearing on Vercel.

Additional hardening:

4. **Release commits are never CI'd (by design, due to `[skip ci]`)** → `release.yml` runs `npm run build` itself _before_ committing/tagging, so a release can never be minted from a red tree.
5. **Dry-run rehearsal** → `workflow_dispatch` with an `dry_run` boolean input: computes the next version and diffs the changelog without committing/tagging/pushing (also available locally via `npm run version:next`).
6. **Branch protection** — history shows direct pushes _and_ PR merges, so protection cannot be assumed either way. If `main` ever requires PRs, the bot push is routed through a repo secret `RELEASE_TOKEN` (PAT/GitHub-App with `contents: write`); if no protection, the default `GITHUB_TOKEN` suffices. Handled via a single `token` substitution in the workflow; default is `GITHUB_TOKEN`.
7. **Non-conventional commits** (e.g. historical `chore: Update`) → fall back to a `patch` bump; never fails the job.
8. **Determinism between CI and Vercel** — the workflow tags after bumping `package.json`, so the prebuild computation and the tag always agree on `main`.

---

## 6. File-by-file plan

### New files

| File                                         | Purpose                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml`              | Auto bump/tag/release/changelog; `workflow_run` gated, concurrency- and idempotency-guarded; build-verify step; `workflow_dispatch` dry-run.                                                                                                                            |
| `scripts/compute-version.mjs`                | Deterministic version resolution: `APP_VERSION` override → `package.json#version` core → `git` suffix (`rev-list --count` + short SHA, or `VERCEL_GIT_COMMIT_SHA`) → `unknown` fallback. Zero dependencies, idempotent, never mutates git. Writes the generated module. |
| `scripts/release-tools.mjs`                  | Shared, tested logic: read latest tag, compute next version from a conventional commit, bump `package.json#version`, generate `CHANGELOG.md` (Keep-a-Changelog), produce release notes. Used by both `release.yml` and the local helper.                                |
| `scripts/__tests__/compute-version.test.mjs` | Unit tests: tagged HEAD → `+build.0.<sha>`; N commits → `+build.N.<sha>`; `APP_VERSION` override; no-git fallback → `unknown`.                                                                                                                                          |
| `scripts/__tests__/release-tools.test.mjs`   | Unit tests: bump rules (`!`→major, `feat`→minor, else→patch), changelog grouping, tag parsing, idempotency guard boolean.                                                                                                                                               |
| `backend/config/generated/app-version.ts`    | Generated data module: `{ releaseVersion, semver, commit, ref, env, releasedAt }`. **Committed default** (keeps dev/tests/tsc working on fresh clone); regenerated by `prebuild` and `predev`.                                                                          |
| `CHANGELOG.md`                               | Generated Keep-a-Changelog, organized into `[Unreleased]` + dated `## [X.Y.Z] - YYYY-MM-DD` sections.                                                                                                                                                                   |
| `VERSIONING-PLAN.md`                         | This document.                                                                                                                                                                                                                                                          |

### Modified files

| File                                                  | Change                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/config/env.ts`                               | Add `releaseVersion` getter that imports the generated module (server-only, lazy, cached). Do **not** change the existing `version` getter (checker contract intact).                                                                      |
| `backend/controllers/version.ts`                      | Response gains `releaseVersion`, `commit`, `ref`, `env`, `releasedAt`. The `version` (fingerprint) field is untouched.                                                                                                                     |
| `frontend/api/version.ts`                             | Expose `releaseVersion` for display.                                                                                                                                                                                                       |
| `frontend/state/use-app-version.ts`                   | Carry `releaseVersion` alongside `hasUpdate` (follower read; checker comparison logic unchanged).                                                                                                                                          |
| `frontend/ui/VersionChecker.tsx`                      | Pass the new `releaseVersion` into the existing `UpdatePopup`. No new popup.                                                                                                                                                               |
| `frontend/ui/UpdatePopup.tsx`                         | Show the new release number in the existing popup text: «تحديث متاح — النسخة الجديدة 1.4.1».                                                                                                                                               |
| `package.json`                                        | `prebuild` gains `&& node scripts/compute-version.mjs`; new `predev` (`node scripts/compute-version.mjs` — `dev.mjs` runs `next dev` directly, bypassing `prebuild`, so dev must regenerate too); new `version:next` local dry-run helper. |
| `app/api/__tests__/notifications-and-version.test.ts` | Keep all 5 existing fingerprint assertions; add assertions for the new fields (assert shape/type, not an exact numeric, so the test stays green as versions advance).                                                                      |
| `sentry.server.config.ts`                             | Add `release: <releaseVersion>` to `Sentry.init`.                                                                                                                                                                                          |
| `sentry.edge.config.ts`                               | Add `release: <releaseVersion>` to `Sentry.init`.                                                                                                                                                                                          |
| `frontend/shared/sentry.ts`                           | Add `release: <releaseVersion>` to the client `sentry.init` (generated module is plain data — safe client-side).                                                                                                                           |
| `README.md`                                           | New "Versioning" section: scheme, bump rules, where it is shown, `version:next` usage.                                                                                                                                                     |
| `AGENTS.md`                                           | Note the version pipeline + new commands in the Commands section.                                                                                                                                                                          |

### Deliberately NOT changing

- `vercel.json`, `next.config.js` (no new headers/runtime config needed).
- `frontend/state/use-app-version.ts` **comparison** semantics and `frontend/ui/VersionChecker.tsx` reload logic.
- The `version` (fingerprint) field of `/api/version` and its 5 existing tests.
- No new runtime dependencies (`.npmrc legacy-peer-deps` untouched).

---

## 7. Version resolution details

`scripts/compute-version.mjs` (runs in `prebuild` and `predev`):

```
inputs: process.env.APP_VERSION, package.json#version, env VERCEL_GIT_COMMIT_SHA, git (best-effort)
1. if APP_VERSION set → use verbatim (release pins / manual deploy override)
2. core   = package.json#version
3. count  = git rev-list --count <lastTag>..HEAD        (best-effort; 0 if unavailable)
4. sha7   = (VERCEL_GIT_COMMIT_SHA || git rev-parse --short HEAD).slice(0,7)  (fallback 'unknown')
5. releaseVersion = `${core}+build.${count}.${sha7}`
6. write backend/config/generated/app-version.ts (idempotent, hermetic, no git mutation)
```

Commit/stamp fields (`commit`, `ref`, `env`, `releasedAt`) resolved from `VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_REF` / `VERCEL_ENV` / build time, each with `unknown`/`development` fallbacks so the module is always valid TS.

Generated module must tolerate the repo's strict TS (`noUncheckedIndexedAccess`, `noUnusedLocals`, etc.) and import cleanly from server, edge, and client Sentry configs.

---

## 8. Testing & verification

Definition of done (per `AGENTS.md`):

1. `npx prettier --check .` — green
2. `npm run lint` — green
3. `npx tsc --noEmit` — green
4. `npm test` — green (new compute/release-tools suites + extended API route tests)
5. `npm run build` — green (requires `NEXT_PUBLIC_WHATSAPP_PHONE`)
6. `npm run check:env-docs` — green if env docs are touched
7. E2E (Playwright) — untouched flows; run `npm run test:e2e` if popup flow is covered
8. Local dry-run of the release pipeline output: `node scripts/release-tools.mjs --next --dry-run`

Manual post-deploy smoke checks:

- `GET /api/version` on Vercel → `releaseVersion: "1.4.1+build.0.<sha>"` (or the exact current tag)
- Trigger a real update (deploy a change) → the existing single popup shows «النسخة الجديدة 1.4.1»
- Sentry dashboard shows releases named after the version
- `CHANGELOG.md` sections group commits correctly after the first real release

---

## 9. Prerequisites & rollout checklist (manual, server-side — 5 min)

1. **Vercel → Project → Settings → Environment Variables → System Environment Variables → enabled.** Required for `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_DEPLOYMENT_ID` during build/runtime. The checker already relies on `VERCEL_DEPLOYMENT_ID`, so this is likely already on — confirm.
2. **Branch protection state of `main`:** if `Require pull request reviews` or similar is enforced, add repo secret `RELEASE_TOKEN` (PAT/GitHub-App, `contents: write`, bypass permission) so the release workflow's tag+commit push is authorized. If `main` accepts direct pushes (as today), nothing to do.
3. Confirm `GITHUB_TOKEN` has `contents: write` (default for workflows is `contents: read` → the workflow must declare `permissions: { contents: write }`).
4. Optional: enable an **Ignored Build Step** on Vercel if richer version introspection is wanted later (exposes `VERCEL_GIT_PREVIOUS_SHA`). Not required by this plan.

### Suggested implementation commit order (small, gated, conventional)

1. `chore(versioning): add versioning plan document`
2. `feat(versioning): add compute-version and release-tools scripts with tests`
3. `feat(versioning): expose releaseVersion via /api/version and generated module`
4. `feat(versioning): surface release version in update popup`
5. `feat(versioning): tag Sentry releases with app version`
6. `ci(versioning): add fully automated release workflow (bump/tag/changelog)`
7. `docs(versioning): document scheme, bump rules, and helper commands`

Each commit must pass the Code Quality gate before the next starts.

---

## 10. Risks & mitigations (summary)

| #   | Risk                                         | Mitigation                                                                                                      | Confidence               |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Release commit re-triggers automation (loop) | `[skip ci]` + idempotency guard + concurrency group                                                             | Designed-out             |
| 2   | PR runs of `code-quality.yml` spawn releases | `workflow_run` gated on `event == push && head_branch == main`                                                  | Designed-out             |
| 3   | Git/tags absent on Vercel build              | Core version from committed `package.json#version`; SHA from `VERCEL_GIT_COMMIT_SHA`; worst case `unknown`      | Designed-out             |
| 4   | Branch protection blocks bot push            | `RELEASE_TOKEN` PAT/GitHub-App secret; default `GITHUB_TOKEN` otherwise                                         | Verify at rollout (#9.2) |
| 5   | Vercel ignores `[skip ci]` deployments       | Desired behavior; and even if a deploy were skipped, the original code push already deployed (safe degradation) | Well-established         |
| 6   | Release built from red tree                  | `release.yml` runs `npm run build` before committing/tagging                                                    | Designed-out             |
| 7   | Concurrent merges race the tag               | `concurrency: group` + idempotency guard                                                                        | Designed-out             |
| 8   | Stale version in local dev                   | `predev` regenerates; committed default as fallback                                                             | Designed-out             |

---

## 11. Definition of done (this task)

- [ ] `VERSIONING-PLAN.md` (this file) exists and reflects every decision above
- [ ] All new/modified files implemented per §6
- [ ] All green gates per §8
- [ ] Rollout checklist §9 executed by the owner (Vercel env-var exposure + branch protection confirm)
- [ ] First real automated release observed end-to-end (commit → CI → release commit/tag → Vercel deploy → `/api/version` reflects the tag → popup shows the number)
