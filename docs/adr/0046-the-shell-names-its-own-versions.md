# The shell names its own versions

ADR-0045 made publishing automatic but kept two things from the manual era, and
both turned out to say something untrue.

The first was the channel release: one GitHub release tagged `shell`, its asset
overwritten by every publish. To make that survivable the asset name had to carry
the version code, `--clobber` had to exist, and the workflow had to reason about
"same version, different bytes" — all of it consequence of one reusable tag.
Nothing about a release _needs_ to be rewritten: a release for version 1.0.3
contains the bytes of 1.0.3, forever.

The second was the number. The APK's `versionName` was the _web_ version at build
time — `1.94.2+shell.20002` — and this shell carries no web code at all. It loads
the live site (ADR-0036), so that number was describing a build the app does not
contain, and it went stale the moment the site deployed. What a user needs to read
in Settings is the version of the thing they installed.

**The shell has its own version, and nobody types it.** `shellVersionName` lives in
`android/shell-version.properties` beside the counter, derived as `1.<minor>.
<patch>` from `(counter - 20000)`: 20003 is 1.0.3, 20100 would be 1.1.0. `--bump`
writes both lines, so a native change moves the number by construction, and the
`--check` CI runs fails a tree where the two disagree — which only happens if
someone hand-edited one. Publishing checks a third thing: that the APK's own
`versionName` equals the derived name, so Gradle and the script cannot drift apart
either.

This is deliberately not semantic versioning. A derived number cannot claim
"breaking" or "backwards compatible", and that is the honest outcome of not
wanting to decide: what it gives up in meaning it gains in being un-foolable. A
major bump would mean changing the base constant, which is a decision rather than
a habit.

**Every version is its own release.** The tag is `android-1.0.3` (the `android-`
prefix reads against the web train's `web-`), the asset is
`royaraqamia-1.0.3.apk`, and the release is titled with its own tag — `android-1.0.3`,
so the releases list and the tags list cannot disagree about what a release is called.
The newest one is marked Latest, so the releases page leads with the APK. The
`--clobber` path still exists in the workflow, but only for the one case that
justifies it: an asset a run created and died before any manifest named it.

**The web train gets the matching prefix.** Web release tags become `web-1.95.0`,
and `scripts/git-utils.mjs` reads both `web-` and the legacy bare `v`, because the
224 tags that already exist are history and had to be renamed in one pass rather
than left in two spellings forever.

**The version reaches a user only inside the app, two ways, both already
available.** Android's app-info screen reads `versionName` from the APK, and the
account area's footer reads the shell's user agent, which now carries the name
_and_ the counter: `RoyaraqamiaShell/1.0.3+20003`. Both spellings have to keep
working — `RoyaraqamiaShell/20003` is what every installed shell sends, and a
phone in someone's hand can only ever send what it was built with — so the parser
reads the counter out of either, with an explicit guard so the `1` of a name is
never mistaken for it. A browser sends no token, renders no footer, and has no
app version: the number is simply absent from the web, which is what keeps it
about the app.

## Considered Options

- **Keeping the channel release with per-version asset names** (ADR-0045's shape).
  Rejected: it worked, but the asset name was doing the job the tag should do, and
  a `--clobber` path had to exist for a case a per-version release removes.
- **Choosing the version by hand.** Rejected: a human-chosen segment means
  something only if the human remembers to choose it, and the failure is silent —
  a release that keeps the old number. The user asked for automatic, and this is
  what that costs: the number is a counter wearing a version's clothes.
- **Keeping `v` for the web train.** Zero churn, and `v` is GitHub's own
  convention. Rejected for symmetry: `android-1.0.3` next to `v1.95.0` leaves a
  reader guessing which app a tag belongs to, and the user chose the rename with
  the cost visible — 224 tags, both spellings read forever, external links to the
  old release URLs break (nothing in this repository linked them).
- **Showing the version in the site's own footer for everyone.** Rejected: it is
  the _installed app's_ version. A browser has no installed app, and the site's own
  version is already available where it belongs.
- **Renumbering the counter to start the name at 1.0.0 with no offset.** Not
  possible: versionCode only goes up, devices are already at 20002, and Android
  refuses a downgrade. The offset is what lets the name start at 1.0.0 without
  lying about the counter.

## Consequences

The counter remains the only thing that decides whether an update exists; the name
is presentation. So `minSupportedVersionCode` still speaks in counters, the
manifest still compares counters, and a name that looks older than another name
means nothing on its own.

The shell's release history is now immutable in the way that matters: the tag in
a published manifest's URL cannot be repointed at other bytes, because that tag
belongs to one version. Old releases are never pruned — they are ~920 KB each, and
an old release is exactly what keeps an old manifest resolvable.

Deleting the old `shell` release has an order that cannot be skipped: the manifest
published today (20002) points _into_ it, and its URL contains the tag, so the
release can only go once the manifest has moved to a per-version release. Moving
the old APKs into `android-1.0.1` and `android-1.0.2` preserves the files under
the new naming; it cannot preserve their old URLs, because those were the tag.

`package.json` and `package-lock.json` join the trigger paths, because the
counter's own definition of a shell change includes a Capacitor plugin dependency
(ADR-0043) and a plugin version bump touches nothing under `android/**`. Without
them, a pull request could be required to bump the counter and then never publish
— the one way a release goes missing without anything failing. The cost is a
ten-second no-op run on dependency merges and web releases, which the verdict
already absorbs.

**Two workflows write to `main`, so the manifest waits its turn.** The release
train checks out the commit Code Quality tested and refuses to push if HEAD has
moved under it. Measured on the first per-version publish: the shell release's
manifest commit landed at 11:48:0x, the release train's `git push` at 11:48:1x was
rejected as non-fast-forward, and the web version for that merge was never cut —
the bump existed only in that runner's workspace. Neither workflow is wrong; they
simply both write to the same branch, and the shell release finishes first because
it does not wait for Code Quality.

The manifest is the one that can wait, so before committing it the workflow polls
for a `Release` run on its own commit and lets it finish (bounded at fifteen
minutes, and a timeout warns and continues, because a broken release train must not
be able to hold a shell release back). Then it fetches and rebases onto `main`
before pushing, in case anything else landed meanwhile. The two commits never touch
the same files — this one is the manifest alone — so the rebase is trivial. The
cost is a shell release that takes a few minutes longer when a web release is in
flight, which is the price of the manifest being the last writer rather than the
loser of a race.
