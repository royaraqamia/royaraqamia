# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Add release version system: `scripts/compute-version.mjs` bakes `releaseVersion`
  (`X.Y.Z+build.N.<sha>`) into the bundle, exposed via `GET /api/version`.
- Add fully automated release workflow that bumps the version from conventional
  commits (`!` → major, `feat` → minor, else → patch), tags, and writes `CHANGELOG.md`.
- Tag Sentry releases with the app version.

### Added

- `scripts/release-tools.mjs` — shared release logic (tag parsing, bump rules, changelog).
- `package.json#version` — now the workflow-maintained source of truth for the core `X.Y.Z`.
- `npm run version:next` — local dry-run helper that rehearses the next release.
- `backend/config/generated/app-version.ts` — generated module carrying release metadata.

### Security

- Non-functional change for release tooling; no access-control or RLS changes.
