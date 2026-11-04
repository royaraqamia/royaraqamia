# The release-notes page is gone, and the app keeps its own

`/account/changelog` existed for one reader: a member already inside the Android shell, who could
open «ما الجديد» and read every release note in Arabic. It was the only route whose whole purpose was
to re-draw a file, and it was a ported pair — the site's `changelog-view.tsx` and the app's
`ChangelogScreen.kt`, with a copy source of its own
([ADR-0098](0098-a-ported-component-is-a-pair.md)) — for a list nobody keeps open. The account page
carried the row on top of that.

## The decision

- **The page and its native twin are deleted.** `app/account/changelog`, `changelog-view.tsx`,
  `shell-changelog-row.tsx`, the copy source, `ChangelogScreen`/`Repository`/`State`/`Copy` and the
  contract generated for the static file are removed, together with the tests, the precache
  exception, and the surface's rows in `perf/surfaces.json`, `docs/mobile/screens.json` and
  `docs/mobile/parity.json`.
- **The route redirects to `/account`.** An installed shell that still links to it, and a bookmark
  from before the removal, land on the account page instead of a 404.
- **The notes still ship, for the app that owns them.** The release cut keeps writing
  `public/android/changelog.json` and `public/android/latest.json`; the update card draws
  `latest.json`'s note ([ADR-0114](0114-the-update-card-is-the-apps-alone.md)), and the notes are in
  the GitHub release either way ([ADR-0090](0090-the-web-has-no-releases-and-the-shell-ships-weekly.md)).
  Nothing about the release pipeline changes: a shell change still carries an Arabic note.

## What this costs

- **A member without the update card cannot browse older notes on the site.** The GitHub release
  holds them, which is a link away rather than a page here. That is the trade: one surface fewer to
  keep as a pair, a copy source and a rendered Markdown table, against a list that a member mostly
  reads while the card is already in front of them.
- **The tracking issue for the port ([#951](https://github.com/royaraqamia/royaraqamia/issues/951))
  has nothing left to port.** Its work is removed rather than finished, which is why this is recorded
  here instead of being inferred from a deleted row.
- **`public/android/changelog.json` now has no reader in this repository.** It is kept on purpose:
  the release workflow writing one fewer file is a change to the pipeline, and the file is a plain
  static asset with no cost at request time.

## Why not the alternatives

- **Keep the page and drop the native screen.** The pair rule would then be one-sided, and the
  screen is switched off anyway: what would remain is a port that can never be switched on.
- **Fold the notes into `/account`.** That page is already the account's own data; a release list
  inside it would cost every visitor the payload for a list that changes once a cut.
- **Stop writing `changelog.json` in the same change.** Tempting, and deliberately deferred: the
  release workflow is the riskier half of this change, and removing its output is a separate
  decision with its own tests.
