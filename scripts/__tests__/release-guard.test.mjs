import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { classifyHeadMove, PUBLISH_ONLY_FILES } from '../release-guard.mjs';

const A = 'aaaaaaaa';
const B = 'bbbbbbbb';

describe('classifyHeadMove', () => {
  it('releases when the tested commit is still HEAD', () => {
    expect(classifyHeadMove({ tested: A, current: A, changedFiles: [] })).toEqual({
      verdict: 'same',
    });
  });

  it('releases when only the published manifest landed on top', () => {
    expect(
      classifyHeadMove({
        tested: A,
        current: B,
        changedFiles: [...PUBLISH_ONLY_FILES],
      })
    ).toEqual({ verdict: 'publish-only', changedFiles: [...PUBLISH_ONLY_FILES] });
  });

  it('skips when real code landed on top, and names it', () => {
    const move = classifyHeadMove({
      tested: A,
      current: B,
      changedFiles: [...PUBLISH_ONLY_FILES, 'app/page.tsx'],
    });

    // `superseded`, not a failure: the version belongs to B's own run, whose
    // window is every commit since the last tag and so contains A too (ADR-0052).
    // A train that ends up behind is release-health's alarm to raise.
    expect(move.verdict).toBe('superseded');
    expect(move.reason).toContain('app/page.tsx');
  });

  it('fails when the tested commit is not an ancestor of HEAD', () => {
    const move = classifyHeadMove({
      tested: A,
      current: B,
      changedFiles: [],
      isAncestor: false,
    });

    expect(move.verdict).toBe('rewritten');
    expect(move.reason).toContain('not an ancestor');
  });

  it('does not accept a lookalike path as the manifest', () => {
    const move = classifyHeadMove({
      tested: A,
      current: B,
      changedFiles: ['public/android/latest.json.bak'],
    });

    expect(move.verdict).toBe('superseded');
  });

  it('tolerates nothing else, even a doc', () => {
    expect(classifyHeadMove({ tested: A, current: B, changedFiles: ['README.md'] }).verdict).toBe(
      'superseded'
    );
  });
});

/**
 * The workflow takes the guard's first stdout line as an output, so the contract
 * is worth running for real: every verdict it can act on prints `skip=`, and the
 * one it cannot act on exits non-zero without it. A throwaway repository is the
 * only way to get all four verdicts out of one run.
 */
describe('the guard says skip on its first line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-guard-'));
  const guard = resolve(process.cwd(), 'scripts/release-guard.mjs');

  const git = (args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  const commit = (subject, files) => {
    for (const [path, content] of Object.entries(files)) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    git(['add', '-A']);
    git([
      '-c',
      'user.name=guard test',
      '-c',
      'user.email=guard@test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      subject,
    ]);
    return git(['rev-parse', 'HEAD']);
  };

  const run = (args) => {
    try {
      return {
        status: 0,
        stdout: execFileSync('node', [guard, ...args], { cwd: dir, encoding: 'utf8' }),
      };
    } catch (error) {
      return { status: error.status, stdout: String(error.stdout ?? '') };
    }
  };

  let first;
  let second;

  beforeAll(() => {
    git(['init', '-q']);
    first = commit('feat(ui): the first change', { 'app/page.tsx': 'one' });
    second = commit('fix(ui): the second change', { 'app/other.tsx': 'two' });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints skip=false and the reason when the tested commit is still HEAD', () => {
    const { status, stdout } = run(['--tested', 'HEAD']);
    expect(status).toBe(0);
    expect(stdout.split('\n')[0]).toBe('skip=false');
    expect(stdout).toContain('is still HEAD');
  });

  it('prints skip=true when a newer commit owns the version', () => {
    const { status, stdout } = run(['--tested', first]);
    expect(status).toBe(0);
    expect(stdout.split('\n')[0]).toBe('skip=true');
    expect(stdout).toContain('app/other.tsx');
  });

  it('prints skip=false when the manifest published on top is all that moved', () => {
    const published = commit('chore(android): publish shell 1.0.5', {
      'public/android/latest.json': '{}',
    });
    const { status, stdout } = run(['--tested', published]);
    expect(status).toBe(0);
    expect(stdout.split('\n')[0]).toBe('skip=false');
  });

  it('fails without a skip line when the branch was rewritten under it', () => {
    git(['checkout', '-q', '-b', 'side', first]);
    const side = commit('feat(side): off the released line', { 'side.ts': 'off' });
    git(['checkout', '-q', '-']);
    const { status, stdout } = run(['--tested', side]);

    expect(status).toBe(1);
    expect(stdout).toContain('not an ancestor');
    expect(stdout).not.toContain('skip=');
  });
});

describe('the release train runs the guard', () => {
  // `process.cwd()`, not `import.meta.url`: the unit suite runs in jsdom, where
  // import.meta.url is an http URL and `new URL` refuses it.
  const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

  it('asks it before it releases anything', () => {
    expect(workflow).toContain('node scripts/release-guard.mjs');
  });

  it('skips the run when the guard says a newer commit owns the version', () => {
    const step = workflow.slice(workflow.indexOf('Verify the Tested Commit Is Still Releasable'));
    expect(step).toContain('steps.releasable.outputs.skip');
    expect(workflow.slice(workflow.indexOf('Idempotency Guard'))).toContain(
      'steps.releasable.outputs.skip'
    );
  });

  it('rebases and retries the push rather than losing the version to a rejected push', () => {
    // Both workflows write to `main`. A rejected push used to lose the version
    // outright: the tag existed only locally and no later run recomputes it.
    const push = workflow.slice(workflow.indexOf('Commit & Tag & Push'));
    expect(push).toContain('for attempt in');
    expect(push).toContain('git rebase origin/main');
  });
});
