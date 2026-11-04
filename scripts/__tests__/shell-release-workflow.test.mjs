import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Android cut grades a batch and is dispatched by hand (ADR-0090, and its
 * 2026-11-04 amendment). What these pin is the shape that makes that true: no
 * clock starts it, the order of the steps, and the fact that the version, the
 * notes, the changelog and the manifest land together.
 *
 * `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
 * import.meta.url is an http URL and `new URL` refuses it.
 */
const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/android-release.yml'),
  'utf8'
);

describe('the Android release train', () => {
  it('is dispatched by hand, and never by a clock', () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    // A top-level `schedule:` key is the thing that was removed; a comment
    // naming it is not a trigger, so the guard matches the key at its indent.
    expect(workflow).not.toMatch(/^ {2}schedule:/m);
    // A push trigger is what shipped an APK per commit.
    expect(workflow).not.toMatch(/^\s{2}push:/m);
  });

  it('asks whether a release is due before it touches a toolchain', () => {
    const planAt = workflow.indexOf('node scripts/android-release.mjs --plan --json');
    expect(planAt).toBeGreaterThan(-1);
    expect(planAt).toBeLessThan(workflow.indexOf('Setup Build Environment'));
    // No cadence to be forced past: every run is a person asking for the batch.
    expect(workflow).not.toContain('--force');
    expect(workflow).not.toContain('--min-age-days');
  });

  it('cuts the version and the notes before it builds', () => {
    const cutAt = workflow.indexOf('cut=$(node scripts/android-release.mjs --apply --json)');
    const publishAt = workflow.indexOf('Build or adopt, sign and stamp');
    expect(cutAt).toBeGreaterThan(-1);
    expect(cutAt).toBeLessThan(publishAt);
  });

  it('takes the cut it planned, without a cadence flag either step could disagree about', () => {
    // Run 41488339972: the plan was forced past the cadence, the cut was not, so
    // `--apply` printed "nothing to release", exited 0, and the build shipped the
    // previous number. No flag to remember now: both steps ask the same question.
    expect(workflow).toContain('node scripts/android-release.mjs --plan --json');
    expect(workflow).toContain('node scripts/android-release.mjs --apply --json');
    // A cut that disagrees with the plan is a broken release, not a number to carry on with.
    expect(workflow).toContain('The cut disagreed with the plan');
  });

  it('publishes the release before it commits, so a failed commit can resume', () => {
    const releaseAt = workflow.indexOf('gh release create');
    const commitAt = workflow.indexOf('chore(android): release $VERSION ($CODE)');
    expect(releaseAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(releaseAt);
    // The tag names the batch's tip rather than a commit invented by CI.
    expect(workflow).toContain('--target "$GITHUB_SHA"');
    expect(workflow).toContain('--latest');
  });

  it('keeps the R8 mapping with the release a crash report names (#667)', () => {
    const createAt = workflow.indexOf('gh release create "$TAG" "$STAGED"');
    const uploadAt = workflow.indexOf(
      'gh release upload "$TAG" "$RUNNER_TEMP/mapping-$VERSION.txt"'
    );
    expect(createAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(createAt);
    expect(workflow).toContain('android/app/build/outputs/mapping/release/mapping.txt');
    // An adopted version has no mapping on this runner; the release still stands.
    expect(workflow).toContain('::warning title=No R8 mapping to keep');
  });

  it('lands the version, the notes, the changelog and the manifest as one commit', () => {
    expect(workflow).toContain(
      'git add -A android/shell-version.properties android/release-notes public/android'
    );
    expect(workflow).toContain('git commit -m "chore(android): release $VERSION ($CODE)"');
    expect(workflow).toContain('git push origin HEAD:main');
  });

  it('rebases on a history it can see, with generated files set aside', () => {
    const rebaseAt = workflow.indexOf('rebase origin/main');
    expect(rebaseAt).toBeGreaterThan(-1);
    expect(workflow.slice(0, rebaseAt)).toContain(
      'if [ "$(git rev-parse --is-shallow-repository)" = true ]'
    );
    expect(workflow).toContain('git -c rebase.autoStash=true rebase origin/main');
  });

  it('verifies the bytes a device will download before announcing anything', () => {
    const verifyAt = workflow.indexOf('Verify what a device will download');
    const releaseAt = workflow.indexOf('gh release create');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(releaseAt);
  });

  it('adopts published bytes instead of rebuilding a version', () => {
    const adoptAt = workflow.indexOf('Is this version already published?');
    const adopt = workflow.slice(adoptAt, workflow.indexOf('Setup Build Environment'));
    const publishAt = workflow.indexOf('Build or adopt, sign and stamp');
    const publish = workflow.slice(publishAt, workflow.indexOf('Upload the APK to storage'));

    expect(adoptAt).toBeGreaterThan(-1);
    expect(adopt).toContain('storage/v1/object/android/$ASSET');
    expect(adopt).toContain('echo "path=$RUNNER_TEMP/published.apk"');
    expect(adopt).toContain('Storage and the release disagree');
    expect(publish).toContain('args+=(--apk "$ADOPT")');
    // A resumed version keeps the day it was first published.
    expect(publish).toContain('args+=(--released-at "$RELEASED_AT")');
  });

  it('leaves everything unpublished on a dry run', () => {
    expect(workflow).toContain('--dry-run');
    expect(workflow).toContain("inputs.dry_run != true && github.ref_name == 'main'");
  });
});

describe('the pull-request checks a shell change has to pass', () => {
  const pullRequest = readFileSync(
    resolve(process.cwd(), '.github/workflows/shell-version.yml'),
    'utf8'
  );

  it('refuses a hand-edited version file', () => {
    expect(pullRequest).toContain('node scripts/android-shell-version.mjs --check');
  });

  it('refuses a shell change with no release note', () => {
    expect(pullRequest).toContain('node scripts/android-release.mjs --check-notes');
  });
});
