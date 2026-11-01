import { describe, expect, it } from 'vitest';

import {
  CHANGELOG_LIMIT,
  STALE_DAYS,
  archivePathFor,
  changelogWithRelease,
  composeReleaseNotes,
  gradeBump,
  healthReport,
  isReleaseBookkeeping,
  notesFromArchive,
  notesFromFragments,
  planRelease,
  summarizeNotes,
} from '../android-release.mjs';

describe('grading a batch', () => {
  it('takes the highest level the batch asks for', () => {
    expect(gradeBump(['fix(android): keep the queue', 'chore(deps): bump'])).toBe('patch');
    expect(gradeBump(['fix(android): keep the queue', 'feat(android): camera'])).toBe('minor');
    expect(gradeBump(['feat(android): camera', 'feat(android)!: drop old scheme'])).toBe('major');
  });

  it('reads a breaking change from the body too', () => {
    expect(gradeBump(['feat(android): camera\n\nBREAKING CHANGE: min WebView 120'])).toBe('major');
  });

  it('is not fooled by an invisible prefix a merge can leave', () => {
    expect(gradeBump(['\uFEFFfeat(android): camera'])).toBe('minor');
  });

  it('grades a commit whose type only looks like a feature as a patch', () => {
    expect(gradeBump(['feature-flag: enable'])).toBe('patch');
    expect(gradeBump(['feat: but not already breaking'])).toBe('minor');
  });
});

describe('the notes a batch ships with', () => {
  it('reads bullets from the fragments, in file order, without repeats', () => {
    const notes = notesFromFragments([
      { name: 'b.md', text: '- إصلاح: شيء\n' },
      { name: 'a.md', text: '- ميزة: أخرى\n\n- إصلاح: شيء\n' },
    ]);

    expect(notes).toEqual(['ميزة: أخرى', 'إصلاح: شيء']);
  });

  it('keeps a line a person wrote without a list marker', () => {
    // Dropping it would lose the note silently, which is worse than a bullet
    // without its dash in the archive.
    expect(notesFromFragments([{ name: 'a.md', text: 'إصلاح بسيط\n' }])).toEqual(['إصلاح بسيط']);
  });

  it('skips an empty fragment', () => {
    expect(notesFromFragments([{ name: 'a.md', text: '\n\n' }])).toEqual([]);
  });

  it('reads a released archive back into bullets', () => {
    const text = composeReleaseNotes({
      version: '1.1.0',
      versionCode: 20100,
      notes: ['ميزة: الكاميرا', 'إصلاح: التحديث'],
      releasedAt: '2026-11-02',
    });

    expect(text).toContain('# 1.1.0');
    expect(text).toContain('versionCode 20100');
    expect(notesFromArchive(text)).toEqual(['ميزة: الكاميرا', 'إصلاح: التحديث']);
    expect(archivePathFor('1.1.0')).toBe('android/release-notes/1.1.0.md');
  });

  it('summarises the manifest field from the first note', () => {
    expect(summarizeNotes(['ميزة: الكاميرا', 'إصلاح: التحديث'])).toBe('ميزة: الكاميرا');
    expect(summarizeNotes([])).toBe('');
    expect(summarizeNotes(['x'.repeat(200)])).toHaveLength(160);
    expect(summarizeNotes(['x'.repeat(200)]).endsWith('…')).toBe(true);
  });
});

describe('the changelog the site serves', () => {
  const release = (version, notes) => ({
    version,
    versionCode: 20000 + Number(version.split('.')[2]),
    releasedAt: '2026-11-02',
    notes,
  });

  it('puts the newest release first, and starts from nothing', () => {
    const changelog = changelogWithRelease({ releases: [] }, release('1.0.22', ['one']));

    expect(changelog.releases).toEqual([
      { version: '1.0.22', versionCode: 20022, releasedAt: '2026-11-02', notes: ['one'] },
    ]);
  });

  it('replaces an entry for the same version instead of repeating it', () => {
    const changelog = changelogWithRelease(
      { releases: [release('1.0.22', ['old']), release('1.0.21', ['older'])] },
      release('1.0.22', ['new'])
    );

    expect(changelog.releases.map((entry) => entry.version)).toEqual(['1.0.22', '1.0.21']);
    expect(changelog.releases[0].notes).toEqual(['new']);
  });

  it('is bounded, so the file cannot grow forever', () => {
    const existing = {
      releases: Array.from({ length: CHANGELOG_LIMIT + 5 }, (_, index) =>
        release(`1.0.${index}`, ['x'])
      ),
    };

    expect(changelogWithRelease(existing, release('1.0.99', ['new'])).releases).toHaveLength(
      CHANGELOG_LIMIT
    );
  });

  it('survives a missing or malformed file', () => {
    expect(changelogWithRelease(null, release('1.0.22', ['one'])).releases).toHaveLength(1);
    expect(
      changelogWithRelease({ releases: 'nope' }, release('1.0.22', ['one'])).releases
    ).toHaveLength(1);
  });
});

describe('planning a release', () => {
  const base = {
    shellChanged: true,
    reasons: ['android/app/build.gradle'],
    baseVersion: '1.0.21',
    messages: ['fix(android): keep the queue'],
    publishedCode: 20021,
    committedCode: 20021,
    committedVersion: '1.0.21',
    ageDays: 8,
  };

  it('publishes nothing when the shell did not change', () => {
    const plan = planRelease({ ...base, shellChanged: false, reasons: [] });

    expect(plan.release).toBe(false);
    expect(plan.reason).toMatch(/no shell change/);
  });

  it('waits out its own cadence unless it was forced', () => {
    const early = planRelease({ ...base, ageDays: 2 });
    expect(early.release).toBe(false);
    expect(early.reason).toMatch(/waits/);

    const forced = planRelease({ ...base, ageDays: 2, force: true });
    expect(forced.release).toBe(true);
    expect(forced.next).toBe('1.0.22');
  });

  it('grades the batch it accumulated', () => {
    expect(planRelease(base)).toMatchObject({
      release: true,
      base: '1.0.21',
      next: '1.0.22',
      versionCode: 20022,
      bump: 'patch',
    });

    expect(planRelease({ ...base, messages: ['feat(android): camera'] })).toMatchObject({
      next: '1.1.0',
      versionCode: 20100,
      bump: 'minor',
    });

    expect(planRelease({ ...base, messages: ['feat(android)!: new scheme'] })).toMatchObject({
      next: '2.0.0',
      versionCode: 30000,
      bump: 'major',
    });
  });

  it('resumes a cut that was written but never published', () => {
    const plan = planRelease({ ...base, committedCode: 20022, committedVersion: '1.0.22' });

    expect(plan).toMatchObject({ release: true, resume: true, next: '1.0.22', versionCode: 20022 });
    expect(plan.reason).toMatch(/never published/);
  });

  it('does not grade a resume again, even with features in the batch', () => {
    const plan = planRelease({
      ...base,
      messages: ['feat(android): camera'],
      committedCode: 20022,
      committedVersion: '1.0.22',
    });

    expect(plan.bump).toBeNull();
    expect(plan.next).toBe('1.0.22');
  });
});

describe('release bookkeeping', () => {
  it('does not count as a shell change', () => {
    // These land in the cut's own commit, after the release tag: counting them
    // would give every release a follow-up release of its own, once a week.
    expect(isReleaseBookkeeping('android/shell-version.properties')).toBe(true);
    expect(isReleaseBookkeeping('android/release-notes/1.1.0.md')).toBe(true);
    expect(isReleaseBookkeeping('public/android/latest.json')).toBe(true);
    expect(isReleaseBookkeeping('public/android/changelog.json')).toBe(true);
    expect(isReleaseBookkeeping('android/app/build.gradle')).toBe(false);
    expect(isReleaseBookkeeping('collector.ts')).toBe(false);
  });
});

describe('the health report the workflow reads', () => {
  const plan = {
    release: true,
    next: '1.1.0',
    oldestChangeAgeDays: 5,
    reason: 'a shell release is due',
  };
  /** The lines `main --health` writes to stdout, the stream `$GITHUB_OUTPUT` parses. */
  const stdoutLines = (report) =>
    Object.entries(report.outputs).map(([key, value]) => `${key}=${value}`);

  it('sends a person the sentence, in prose the output parser would refuse', () => {
    const report = healthReport({ plan, maxAgeDays: STALE_DAYS });
    expect(report.prose).toBe('a shell release is due (1.1.0) but not yet overdue');
    // The regression: this line reached `$GITHUB_OUTPUT`, and failed the step.
    expect(stdoutLines(report)).not.toContain(report.prose);
  });

  it('keeps every stdout line a key=value pair', () => {
    const lines = stdoutLines(healthReport({ plan, maxAgeDays: STALE_DAYS }));
    expect(lines).toEqual(['stalled=false', 'release=true', 'next=1.1.0', 'age_days=5']);
    for (const line of lines) expect(line).toMatch(/^[a-z_]+=/);
  });

  it('counts an overdue backlog as stalled, and a level train as neither', () => {
    const overdue = healthReport({ plan: { ...plan, oldestChangeAgeDays: 10 }, maxAgeDays: 9 });
    expect(overdue.outputs.stalled).toBe('true');
    expect(overdue.prose).toMatch(/oldest change is 10 day/);

    const level = healthReport({ plan: { release: false, reason: 'no shell change' } });
    expect(level.outputs).toMatchObject({
      stalled: 'false',
      release: 'false',
      next: '',
      age_days: 0,
    });
    expect(level.prose).toBe('the train is level: no shell change');
  });
});
