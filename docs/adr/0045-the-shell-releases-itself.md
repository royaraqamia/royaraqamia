# The shell releases itself

ADR-0043 gave the shell a version counter and a published manifest. ADR-0044 gave it the install path,
and left publishing manual for one stated reason: the upload keystore lives outside the repository, and
duplicating it into CI is a decision about where the backup lives, not a build detail. This is that
decision being taken the other way, along with the three things that had to change for it to be safe.

Two things pushed it. The first is that publishing `20001` by hand needed a sequence of five commands
written down in two places, and the two did not agree: the docs had learned `--latest=false` and the
script's own printed hint had not (`docs(android)` and the follow-up that fixed the hint). An instruction
that exists twice disagrees with itself, and the copy that ran was the wrong one. The second is that the
same hand-run publish pointed the manifest at a release that did not exist yet, so the URL 404'd until
somebody created it — a failure no test can see, because a URL's _shape_ is all a test can check. Both are
the class of mistake a person makes once and a machine makes never.

**The keystore goes into repository secrets, and what protects the release is the checks, not the
secrecy.** Four secrets: the keystore base64-encoded, the store password, the alias, and that key's
password. The reason this is defensible rather than reckless is that the key was never what kept a bad
publish out of users' hands: the checks are. `android:publish` refuses an unsigned APK, a key
`public/.well-known/assetlinks.json` does not list, and a version code that disagrees with the counter;
`Shell Version` refuses a shell change with no bump on the pull request; the JVM tests run before the
build; and the workflow hashes the uploaded bytes before it announces them. None of those need a secret in
CI, and all of them still apply when the secret is there. Rotating the key is a joint change with
`assetlinks.json`, and a device with the app installed cannot be talked out of the old signature — which
the docs now say in the same breath as the rotation instructions.

**The trigger is a push to `main` that touches the shell.** Not a tag, not the release train: the APK's
version is its own counter (ADR-0043), and the only thing that means "a new APK exists" is a change to
`android/**` or the Capacitor config. The workflow's first step is the verdict — the counter against the
published manifest — so a push that touched nothing native, or a re-run of a publish that already
happened, stops in about ten seconds for nothing, with the reason in the run summary. A change to the
workflow file itself is in the path filter, which means the merge that introduces this workflow publishes
whatever is pending; a workflow change is a good moment to re-check that the channel is current.

**One immutable asset per version code, and the URL is derived rather than typed.** The asset is
`royaraqamia-shell-<versionCode>.apk`, and the manifest's `apkUrl` is computed from the manifest that is
published now by replacing the last segment — host, repository and tag carried over. (Superseded in part by
ADR-0046: each version is now its own release and the asset is named for the shell's own version rather
than the counter, which is what removed the reusable tag in the first place.) The first spelling,
one file named `royaraqamia-shell.apk` that each publish overwrote, meant a device that had read a
manifest could download bytes that no longer matched its hash. That fails safe (the shell refuses them),
but "the update sometimes does not work" is not a failure mode a release channel should be able to have,
and an older manifest that names its own file keeps working forever.

**Nothing is announced until the uploaded bytes have been hashed.** The order is build → stamp → upload →
**download it back and hash it** → commit the manifest. The step in the middle is the one that had never
happened before: until it existed, the only thing that had ever seen the published file was the machine
that uploaded it. Everything before the commit is recoverable — the published channel is untouched, and
an asset that no committed manifest has ever named is a leftover from a run that died, which the next run
replaces. A version code whose _committed_ manifest names it with different bytes is the one case that
fails hard, because that is republishing history.

**Only `main` publishes.** A manual dispatch on any ref runs the same verdict, tests, build and signing;
the upload and the manifest commit are gated on `main`, so a branch can rehearse (with `dry_run`) but
cannot put an asset on the release that no site serves.

## Considered Options

- **Publishing from a tag or as part of the web release.** Rejected for the reason ADR-0043 exists: the
  shell has its own counter precisely so a web release is not an APK release. Tying the two together again
  would either publish an identical APK on every deploy or need the same path filter to decide when not
  to — the coupling buys nothing and adds a way to be wrong.
- **A schedule that publishes whatever is pending.** Rejected: a push is the only moment the information
  exists, and an unattended timer would publish a shell change nobody had decided to ship.
- **`softprops/action-gh-release`, as the release train uses.** Rejected here: it replaces a release and
  its notes, while what this needs is to attach one asset to a long-lived channel release, and
  `gh release upload` without `--clobber` is the immutability rule expressed in the one command that could
  break it. It also keeps a third-party action off the path that carries the signing key.
- **Committing the manifest by hand after CI uploads.** Rejected: CI knows the hash and the person does
  not, and "land this file someone else generated" is exactly where the 404 came from.
- **Keeping the key local and having CI stop before the upload.** This was ADR-0044's position, and it is
  still available: `workflow_dispatch` with `dry_run` builds and signs, and the local `android:publish`
  path is documented for an emergency. What it cannot be is the default, because the default is what
  actually releases the app.
- **`--clobber` everywhere, for simplicity.** Rejected: the point of the per-version name is that
  overwriting is impossible; the single place `--clobber` is allowed is an asset no committed manifest has
  ever named.

## Consequences

The signing key now exists in two places — this machine's `D:\Projects\royaraqamia-android-keys` and the
repository's secrets. That is the backup story as well as the convenience: losing both is losing the
ability to update the app at all, since Android will not accept an update signed by a different key, ever.
Rotating deliberately means updating the secret and `assetlinks.json` together, and every installed shell
has to be replaced by hand.

A shell change now reaches users without anyone deciding to release it. The safety is in the ordering and
the checks rather than in the pause, which is what the ordering and the checks are for; `minSupported`
remains the only way to say an update cannot wait, and it is still carried forward unless raised.

The workflow costs about four minutes of runner time when there is something to publish — 4m06s on the
first run, cache cold, and that run included the JVM tests, the build, the upload and the re-download
check — and ten seconds when there is not, measured on the manual dispatch that found `20002` already
published. The shell's JVM tests run inside it as well as on pull requests, so a direct push to `main` —
the release train — cannot carry untested native code into a release.

`npm run android:publish` stays the same command, now with `--json` for the workflow and `--verdict` for
the question "is there anything to publish at all", both unit-tested rather than written in shell. A
failure after the asset is uploaded and before the manifest is committed is finished by re-running the
workflow, which is why the verifications happen before the commit rather than after it.
