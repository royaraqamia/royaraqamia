import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { classifyStall, isPublishOnly, STALE_MINUTES } from '../release-health.mjs';

const HEALTH = resolve(process.cwd(), 'scripts/release-health.mjs');
const MINUTE = 60 * 1000;

describe('classifyStall', () => {
  const now = 1_000_000_000_000;
  const staleMs = 30 * MINUTE;
  const commits = (...rows) =>
    rows.map(([minutesAgo, subject, files = ['app/page.tsx']]) => ({
      sha: 'a'.repeat(40),
      subject,
      committedAt: now - minutesAgo * MINUTE,
      files,
    }));

  it('reports nothing when the window holds no commit at all', () => {
    expect(classifyStall({ commits: [], now, staleMs })).toMatchObject({
      stalled: false,
      newest: null,
    });
  });

  it('reports nothing while the newest unreleased commit is young', () => {
    const verdict = classifyStall({ commits: commits([5, 'fix(ui): a change']), now, staleMs });
    expect(verdict.stalled).toBe(false);
    expect(verdict.oldest.subject).toBe('fix(ui): a change');
  });

  it('reports a stall once the backlog is older than the threshold', () => {
    expect(
      classifyStall({ commits: commits([31, 'fix(ui): a change']), now, staleMs })
    ).toMatchObject({ stalled: true, ageMs: 31 * MINUTE });
  });

  it('measures the backlog from its oldest commit, so a busy main still reports', () => {
    // The stall of 2026-10-16 looked like this: commits kept landing, so the tip
    // was always young while the backlog grew.
    const verdict = classifyStall({
      commits: commits([90, 'fix(ui): the old one'], [2, 'fix(ui): the new one']),
      now,
      staleMs,
    });
    expect(verdict.stalled).toBe(true);
    expect(verdict.oldest.subject).toBe('fix(ui): the old one');
    expect(verdict.newest.subject).toBe('fix(ui): the new one');
    expect(verdict.owed).toHaveLength(2);
  });

  it('ignores a manifest republish, which owes no version', () => {
    const verdict = classifyStall({
      commits: commits([90, 'chore(android): publish shell 1.0.5', ['public/android/latest.json']]),
      now,
      staleMs,
    });
    expect(verdict.stalled).toBe(false);
    expect(verdict.owed).toHaveLength(0);
  });

  it('does not let a young manifest publish hide an old owed commit', () => {
    const verdict = classifyStall({
      commits: commits(
        [120, 'fix(ui): a change'],
        [1, 'chore(android): publish shell 1.0.5', ['public/android/latest.json']]
      ),
      now,
      staleMs,
    });
    expect(verdict.stalled).toBe(true);
    expect(verdict.newest.subject).toBe('fix(ui): a change');
  });

  it('ignores a release commit in the window', () => {
    const verdict = classifyStall({
      commits: commits([600, 'chore(release): web-1.0.1 [skip ci]', ['package.json']]),
      now,
      staleMs,
    });
    expect(verdict.stalled).toBe(false);
    expect(verdict.owed).toHaveLength(0);
  });
});

describe('isPublishOnly', () => {
  it('is true only when every file is the manifest', () => {
    expect(isPublishOnly(['public/android/latest.json'])).toBe(true);
    expect(isPublishOnly(['public/android/latest.json', 'app/page.tsx'])).toBe(false);
    expect(isPublishOnly(['public/android/latest.json.bak'])).toBe(false);
    // A commit with no files (a merge, or an unreadable diff) is not a publish.
    expect(isPublishOnly([])).toBe(false);
  });
});

/**
 * The monitor is a scheduled job nobody watches, so the thing worth testing is
 * that it fires when it should and stays quiet when it should not — against a
 * real repository, since that is what it reads. Each case builds its own.
 */
describe('the monitor reads a real repository', () => {
  const dirs = [];

  const makeRepo = () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-health-'));
    dirs.push(dir);
    const git = (args, env = {}) =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();

    git(['init', '-q']);

    const commit = (subject, files, minutesAgo = 0) => {
      for (const [path, content] of Object.entries(files)) {
        const full = join(dir, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
      }
      git(['add', '-A']);
      const when = new Date(Date.now() - minutesAgo * MINUTE).toISOString();
      git(
        [
          '-c',
          'user.name=health test',
          '-c',
          'user.email=health@test',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-m',
          subject,
        ],
        { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }
      );
    };

    const run = (args = []) => {
      const result = spawnSync('node', [HEALTH, ...args], { cwd: dir, encoding: 'utf8' });
      const outputs = Object.fromEntries(
        String(result.stdout ?? '')
          .split('\n')
          .filter((line) => line.includes('='))
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
      );
      return {
        status: result.status,
        outputs,
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? ''),
      };
    };

    return { dir, git, commit, run };
  };

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('is quiet when the release commit is on top', () => {
    const repo = makeRepo();
    repo.commit('feat(ui): a change', { 'app/page.tsx': 'a' }, 60);
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 59);

    const { status, outputs } = repo.run();
    expect(status).toBe(0);
    expect(outputs.stalled).toBe('false');
    expect(outputs.count).toBe('0');
    expect(outputs.age_minutes).toBe('0');
  });

  it('is quiet while an unreleased commit is still fresh', () => {
    const repo = makeRepo();
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 60);
    repo.commit('fix(ui): a change', { 'app/page.tsx': 'a' }, 5);

    const { outputs } = repo.run();
    expect(outputs.stalled).toBe('false');
    expect(outputs.count).toBe('1');
  });

  it('fires on an unreleased commit older than the threshold, and names it', () => {
    const repo = makeRepo();
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 180);
    repo.commit('fix(ui): the owed change', { 'app/page.tsx': 'a' }, 60);

    const { status, outputs } = repo.run();
    expect(status).toBe(0);
    expect(outputs.stalled).toBe('true');
    expect(outputs.count).toBe('1');
    expect(outputs.sha).toHaveLength(8);
    expect(outputs.subject).toBe('fix(ui): the owed change');
    expect(Number(outputs.age_minutes)).toBeGreaterThanOrEqual(59);
  });

  it('fires on a backlog whose tip is still fresh, as a busy main looks', () => {
    const repo = makeRepo();
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 180);
    repo.commit('fix(ui): the first owed change', { 'app/page.tsx': 'a' }, 90);
    repo.commit('fix(ui): the newest owed change', { 'app/other.tsx': 'b' }, 1);

    const { outputs } = repo.run();
    expect(outputs.stalled).toBe('true');
    expect(outputs.count).toBe('2');
    expect(outputs.subject).toBe('fix(ui): the first owed change');
    expect(Number(outputs.age_minutes)).toBeGreaterThanOrEqual(89);
  });

  it('takes the threshold from the flag', () => {
    const repo = makeRepo();
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 180);
    repo.commit('fix(ui): a change', { 'app/page.tsx': 'a' }, 60);

    expect(repo.run(['--stale-minutes', '120']).outputs.stalled).toBe('false');
    expect(repo.run(['--stale-minutes', '30']).outputs.stalled).toBe('true');
  });

  it('ignores a manifest publish above the release commit', () => {
    const repo = makeRepo();
    repo.commit('feat(ui): a change', { 'app/page.tsx': 'a' }, 200);
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 190);
    repo.commit('chore(android): publish shell 1.0.5', { 'public/android/latest.json': '{}' }, 90);

    const { outputs } = repo.run();
    expect(outputs.stalled).toBe('false');
    expect(outputs.count).toBe('0');
  });

  it('recognizes a release commit whose subject carries a BOM', () => {
    const repo = makeRepo();
    repo.commit('fix(ui): a change', { 'app/page.tsx': 'a' }, 200);
    repo.commit('\uFEFFchore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 190);

    expect(repo.run().outputs.stalled).toBe('false');
  });

  it('is quiet when the history holds no release commit at all', () => {
    const repo = makeRepo();
    repo.commit('feat(ui): the first change', { 'app/page.tsx': 'a' }, 600);

    const { status, outputs, stderr } = repo.run();
    expect(status).toBe(0);
    expect(outputs.stalled).toBe('false');
    expect(stderr).toContain('no release commit');
  });

  it('prints only github-output lines on stdout, since the workflow appends them', () => {
    const repo = makeRepo();
    repo.commit('chore(release): web-1.0.1 [skip ci]', { 'package.json': '{}' }, 180);
    repo.commit('fix(ui): a change', { 'app/page.tsx': 'a' }, 60);

    const { outputs, stdout } = repo.run();
    for (const line of stdout.split('\n').filter(Boolean)) {
      expect(line).toMatch(/^[a-z_]+=/);
    }
    expect(Object.keys(outputs).sort()).toEqual([
      'age_minutes',
      'count',
      'sha',
      'stalled',
      'subject',
    ]);
  });

  it('defaults its threshold to two release cycles', () => {
    expect(STALE_MINUTES).toBe(30);
  });
});

describe('the monitor is wired to a schedule', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/release-health.yml'),
    'utf8'
  );

  it('runs on a schedule and by hand', () => {
    expect(workflow).toContain('cron:');
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('runs the script and feeds its output to the alert step', () => {
    expect(workflow).toContain('node scripts/release-health.mjs');
    expect(workflow).toContain('steps.train.outputs.stalled');
  });

  it('may write issues and reads the repository', () => {
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('contents: read');
  });

  it('closes the alert it opened once the train is level again', () => {
    const alert = workflow.slice(workflow.indexOf('Open, update or close the alert'));
    expect(alert).toContain("state: 'closed'");
    expect(alert).toContain('Recovered');
  });
});
