# A published version's bytes are adopted, not rebuilt

The shell release builds an APK, stamps `public/android/latest.json` from it, uploads the file to the
bucket, attaches it to `android-<version>` and only then commits the manifest. The comment on the step
said what happens when that last commit fails: the asset is uploaded and the manifest stale, which is
the safe direction, and _re-running finishes the job_. On shell 1.0.13 it did not.

The first run (2026-10-20 14:22) built and signed 1.0.13, uploaded 8,052,296 bytes with sha256
`c9540e…`, attached them to `android-1.0.13`, verified them through the public URL, and then failed
committing the manifest: the shallow rebase bug of ADR-0068. The rerun, triggered by the workflow fix
itself, rebuilt from the same `android/` tree and produced 8,052,296 bytes with sha256 `029b51…`. The
upload step compares a duplicate object against the build's hash, so it refused: "A version is never
republished with different bytes — bump `android/shell-version.properties` instead." The manifest still
says 1.0.12, so no device is offered 1.0.13, and every later run that tries to finish it fails the same
way. A version bump would unblock the channel, but it would not make the promise true: the same thing
happens after any failure between the upload and the manifest commit.

The bytes were not reproducible. The two APKs are the same size, the zip entry timestamps are the
fixed `1981-01-01` AGP writes, and the signing key is RSA, whose PKCS#1 signature is deterministic for
identical input — so the difference is in the build output, not in the packaging or the signature.
Nothing in the build stamps a time or a commit, which means the next build could differ again. A
release channel cannot depend on a rebuild reproducing bytes that were already published.

So the run now checks the bucket **before** it builds. If `royaraqamia-<versionName>.apk` is already
there, the verdict has just proved that the committed manifest does not name this version (that is
what `publish=true` means), so those bytes are this version's, from a run that died before announcing
them. The run downloads them, checks them against the release's asset digest when a release exists,
and stamps the manifest from the file itself — `android:publish --apk` re-runs its package,
`versionCode`/`versionName` and signing-key checks on the adopted bytes, which is stronger than trusting
the upload. The dialog text and release date come from the release that first published the version
(the first line of its body, and its `createdAt`), not from the commit that happens to be on `main`
when the rerun is triggered.

If the bucket object is missing, the run builds exactly as before. If storage and the release disagree
about the bytes, it fails before uploading or committing: one of the two was replaced, and neither can
be trusted to describe what a device gets.

## Considered options

- **Bump the counter and publish 1.0.14.** Rejected as the fix: it unblocks one version and leaves
  `android-1.0.13` as a release nothing names, and the next failed manifest commit needs another manual
  bump. The release machinery is supposed to recover by itself.
- **Replace the bucket object and the release asset with the new build.** Rejected: `android-1.0.13`
  was already verified and published as `c9540e…`; replacing it is republishing history, which
  ADR-0045 and ADR-0046 exist to prevent. The workflow still allows replacing an asset that no
  committed manifest has ever named, but only when no release carries it yet.
- **Make the build reproducible.** The right long-term property, and not one the release path can
  assume today: the cause of the 1.0.13 difference is not identified, and a channel that fails closed
  when it appears is worse than one that adopts what it published. A future change that makes builds
  byte-identical would make this step unnecessary, not wrong.
- **Compare only size, not hash, and accept the difference.** Rejected: two different files of the same
  size are not the same file; the manifest names a hash, and the device verifies it.

## Consequences

A rerun after a failure between the upload and the manifest commit finishes in about a minute: no
Gradle build, no JDK toolchain work beyond `cap sync` for the config guard. It stamps and commits the
manifest naming the bytes a device already gets, which is the only outcome that keeps the release, the
bucket and the manifest describing one file.

Adoption trusts that a second build under the same counter differs only by build nondeterminism, not by
a source change. `Shell Version` already refuses a pull request that changes `android/**` without
moving the counter, and the counter is what decides whether a publish happens at all — so a tree that
reaches this step with the counter unchanged is the tree that version was cut from, as far as the
repository can tell. `scripts/__tests__/shell-release-workflow.test.mjs` pins the adoption step and the
`--apk`/`--released-at` wiring; `scripts/__tests__/android-publish.test.mjs` pins the `versionName` in
the verdict the step reads.
