# 0207. An advisory is triaged by reachability, not by severity alone

## Status

Accepted (2026-11-17).

## Context

A push to `main` on 2026-11-17 failed `security-scan.yml`'s `Dependency Audit (npm audit)` job with four
high findings. All four came from one advisory: GHSA-fc5q-39xc-vjpf, a ReDoS in `picomatch` reached
through `@sentry/nextjs` → `@rollup/plugin-commonjs` → `@rollup/pluginutils` → `picomatch`. Two facts
made the raw gate useless as a decision:

- The advisory covers every released `picomatch` version (`<=4.0.7`) and lists **no patched version**.
  `npm audit fix --force` only downgrades `@sentry/nextjs` from 11.x to 8.38.0, trading a theoretical
  build-time denial of service for a guaranteed major-version regression.
- `picomatch` is reached here only from Sentry's bundler plugins during `next build`. No request path
  hands an attacker-supplied glob to it, so the availability risk in our deployment is not the risk the
  CVSS score describes.

The advisory was reviewed into GitHub's database the same day the job started failing, on a tree that
had not changed. That is the normal case, not the exception: a severity-only gate on a mutable advisory
feed turns any unrelated push into a build failure and teaches people to weaken the gate.

## Decision

1. **Keep both audit lanes.** Production dependencies block every push and pull request; the full tree
   blocks only the weekly scheduled run. `npm run audit:deps -- --scope=production|all` replaces the
   raw `npm audit --audit-level=high` commands in `.github/workflows/security-scan.yml`.
2. **Judge a finding by severity and reachability.** High and critical advisories block by default. An
   advisory is accepted only when its path into the tree cannot carry attacker-controlled input, or
   when no patched version exists and no safe alternative does.
3. **One exception file, with an expiry.** `security/audit-exceptions.json` holds the accepted
   advisories. Each entry carries the GHSA id, scope (`production` or `all`), reason, owner, an upstream
   tracking URL and an expiry at most one year out. `scripts/check-dependency-audit.mjs` rejects
   missing fields, duplicates, expired entries and bad dates before it even calls `npm audit`, so an
   exception cannot silently become permanent.
4. **Suppress the advisory, not the package.** Matching is by GHSA id from `npm audit`'s `via` entries.
   A second advisory on the same package still blocks, and a production-only exception does not weaken
   the full-tree audit.
5. **Never game the lockfile.** No `--force` downgrades and no `overrides` that pin a version merely to
   silence npm. An override is for a real, intentional version choice, not for hiding a finding.
6. **Say what was accepted in CI output.** Every suppressed advisory is printed with its affected
   packages, so the gate's log is a review surface rather than a green check hiding exceptions.

The first entry is this advisory: scope `all`, expiring 2026-12-17, linked to the upstream fix PR.
It must be re-confirmed or replaced before that date.

## Consequences

- A new advisory on an unchanged tree can still be triaged in one small, reviewed file instead of by
  editing CI or rewriting the lockfile.
- An exception lapses on its own. The gate fails until someone re-checks reachability and renews it,
  which is the point: acceptance is a decision with a review date, not a permanent carve-out.
- When upstream ships `picomatch > 4.0.7` and the chain picks it up, the exception is removed and the
  advisory blocks again if it ever returns.
- A package with a slow security response now needs an owner and an upstream link, which makes who is
  watching the issue visible.
