# The web has no releases, and the shell ships on a weekly train

Two release pipelines were carrying their weight backwards.

The **web train** published a release for every merge: it bumped `package.json#version`, wrote a
`CHANGELOG.md` section from the commit subjects, committed `chore(release): web-1.149.4 [skip ci]`,
tagged `web-1.149.4`, and created a GitHub Release. By the time of this decision the repository held
more than three hundred such tags. None of it reached a user. The site is deployed by Vercel on every
push; nobody installs a version; the only thing a version could name — the bytes serving a request —
was already named by the commit. The tags were also load-bearing in a way that cost real outages
(ADR-0051: a tag that outlived its rejected branch stopped the train for a day), and the
`Release`/`Release Health`/`release-guard` machinery around them existed only to keep that number
moving.

The **shell train** had the opposite fault. It published an APK for every push that touched
`android/**`, `capacitor.config.ts` or a Capacitor plugin dependency, and each publish prompted every
installed app. Twenty-one APKs in the shell's first weeks, most of them one sentence apart: a colour,
a plugin list regeneration, a log line. Users learn to dismiss those prompts, and the ones that
matter stop being read.

## The two decisions

**1. The web has no releases.** No tags, no GitHub Releases, no `CHANGELOG.md`, and no per-merge bump
commit. The identity of a deploy is its build metadata —
`<X.Y.Z>+build.<N>.<7-char-sha>`, from `scripts/compute-version.mjs` — which every deploy already
reported and which Sentry already used as a release name. `X.Y.Z` stays in `package.json` as the
product version, bumped by hand at a milestone, never by a merge. A continuous-deployment site has no
install to version; the commit is the version (Vercel's own deploy IDs and Sentry's default
`release` both say so).

The tag helpers, `release-tools.mjs`, `release-guard.mjs`, `release-health.mjs` and the `release.yml`
workflow are deleted. `next.config.js` reads its Sentry release from the generated module instead of
composing `v<package.json version>`, because a sourcemap named one string and an event reporting
another is worse than no sourcemap at all.

**2. The shell ships on a graded weekly train, and its notes are written by people.** Once a week
(Monday 06:00 UTC) `.github/workflows/android-release.yml` grades everything native that accumulated
since the last `android-*` release and publishes **one** version for it:

| Commit type in the batch | Component |
| ------------------------ | --------- |
| `!` / `BREAKING CHANGE`  | major     |
| `feat`                   | minor     |
| anything else            | patch     |

A week with no native change publishes nothing. A manual dispatch cuts the batch immediately, for a
crash or security fix that cannot wait.

The version file is written by the cut, not by a pull request. Each change that ships carries an
Arabic note under `android/release-notes/unreleased/`; the pull-request check refuses a shell change
without one, and the cut refuses to ship without one. That is where the changelog moved to: the
release page users read, and `public/android/changelog.json`, which `/account/changelog` renders
inside the app. Notes are curated by a person, in the language the app's users read — a changelog
generated from commit subjects says `fix(android): regenerate the plugin lists`, which is not a
sentence anybody outside this repository should have to parse.

## The version scheme

`versionName` is semantic and `versionCode` is derived from it:

```
versionName  1.4.2
versionCode  20000 + (major - 1) * 10000 + minor * 100 + patch
```

So `1.0.21` — the release this project had already shipped — is 20021, and every later release is
strictly higher: `1.1.0` is 20100, `2.0.0` is 30000. The 20000 base is the one the counter already
had (ADR-0043), which is above every code the old site-derived scheme could produce.
Two digits per lower component is what keeps the mapping injective; `1.0.100` is refused rather than
silently colliding with `1.1.0`.

This is the part that makes the number mean something. Before, `1.0.3` was a counter's mirror, and the
only way to release anything was to bump the counter — nine times in a week, with no relationship
between the number and the contents. Now the batch is graded once, and `1.1.0` says the shell gained
something.

## Why not a per-merge release with a staged rollout

Staged rollout is the other half of how big native apps ship, and it is unavailable here: the shell
installs itself from our own origin (ADR-0044, ADR-0047) and is not in a store with percentage-based
staging. The weekly train is the part of that practice the project can actually implement — batching,
grading, and release notes written for the people receiving them.

## What still has to hold

- `android/shell-version.properties` is a release artifact. `shell-version.yml` fails a pull request
  that moves it, and fails one that changes the shell without a note fragment.
- The published version never goes backwards, and a version's bytes are published once: the manifest
  refuses a lower code, storage refuses an overwrite, and a re-run adopts the bytes already uploaded
  instead of rebuilding them (ADR-0069).
- A cut that fails between publishing the APK and committing the manifest is resumed, not re-graded:
  the tag ahead of the manifest is what the next run reads (`scripts/android-release.mjs`).
- The release's own bookkeeping — the version file, the notes, the manifest, the changelog — does not
  count as a shell change, or every release would earn itself another one the following Monday.
- `release-health.yml` raises one issue when native changes have sat unreleased past the cadence
  (nine days), which is the only way a train that never started becomes visible.

Supersedes ADR-0046's web half and the release-train machinery of ADR-0051, ADR-0052 and ADR-0068.
ADR-0043, ADR-0044, ADR-0047 and ADR-0069 still stand, amended only in when a version is written.
