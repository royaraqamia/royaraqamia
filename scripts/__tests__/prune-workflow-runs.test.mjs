import { describe, expect, it } from 'vitest';

import { DEFAULTS, parseArgs, prune, selectTargets } from '../prune-workflow-runs.mjs';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** A run as the REST API answers it, with only what the script reads. */
function run(id, ageDays, overrides = {}) {
  return {
    id,
    created_at: new Date(NOW - ageDays * DAY).toISOString(),
    status: 'completed',
    name: `run ${id}`,
    ...overrides,
  };
}

function headers(remaining = '900') {
  return { get: (key) => (key === 'x-ratelimit-remaining' ? remaining : null) };
}

function json(body, remaining) {
  return { ok: true, status: 200, headers: headers(remaining), json: async () => body };
}

function noContent(remaining = '900') {
  return { ok: true, status: 204, headers: headers(remaining), text: async () => '' };
}

function status(code, body = '', remaining = '900') {
  return { ok: code < 300, status: code, headers: headers(remaining), text: async () => body };
}

/** Answers a list page and records the delete calls in order. */
function github({ runs, pageSize = 100, deleteReply } = {}) {
  const deleted = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'DELETE') {
      const id = Number(url.split('/').pop());
      const reply = deleteReply ? deleteReply(id) : noContent();
      if (reply.status === 204) deleted.push(id);
      return reply;
    }
    const page = Number(new URL(url).searchParams.get('page'));
    const start = (page - 1) * pageSize;
    return json({ total_count: runs.length, workflow_runs: runs.slice(start, start + pageSize) });
  };
  return { fetchImpl, deleted };
}

describe('prune-workflow-runs', () => {
  it('reads the flags, the environment and the defaults', () => {
    expect(parseArgs([], {})).toMatchObject({
      keepDays: DEFAULTS.keepDays,
      maxDeletes: DEFAULTS.maxDeletes,
      dryRun: false,
    });
    expect(parseArgs(['--keep-days', '7', '--max', '25', '--dry-run'], {})).toMatchObject({
      keepDays: 7,
      maxDeletes: 25,
      dryRun: true,
    });
    expect(parseArgs([], { KEEP_DAYS: '3', MAX_DELETES: '4', DRY_RUN: 'true' })).toMatchObject({
      keepDays: 3,
      maxDeletes: 4,
      dryRun: true,
    });
    expect(() => parseArgs(['--max'], {})).toThrow('--max needs a value');
    expect(() => parseArgs(['--keep-days', '0'], {})).toThrow('positive integer');
    expect(() => parseArgs(['--nope'], {})).toThrow('unknown argument: --nope');
  });

  it('takes completed runs past the cutoff, oldest first, and never an unfinished one', () => {
    const runs = [
      run(1, 0.5),
      run(2, 5),
      run(3, 4, { status: 'in_progress' }),
      run(4, 9),
      run(5, 3, { status: 'queued' }),
    ];

    const { targets, backlog } = selectTargets(runs, { cutoff: NOW - 2 * DAY, maxDeletes: 10 });

    expect(targets.map((r) => r.id)).toEqual([4, 2]);
    expect(backlog).toBe(2);
  });

  it('deletes the oldest runs that are past the cutoff, and reports what it left', async () => {
    const runs = [run(10, 0.2), run(11, 3), run(12, 6), run(13, 9)];
    const { fetchImpl, deleted } = github({ runs });
    const lines = [];

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      keepDays: 2,
      now: NOW,
      fetchImpl,
      log: (line) => lines.push(line),
    });

    expect(deleted).toEqual([13, 12, 11]);
    expect(result).toMatchObject({ total: 4, backlog: 3, deleted: 3, failed: 0 });
    expect(lines.at(-1)).toBe('deleted 3, already gone 0, failed 0');
  });

  it('stops at the cap and says how much is left for the next run', async () => {
    const runs = [run(20, 3), run(21, 4), run(22, 5), run(23, 6)];
    const { fetchImpl, deleted } = github({ runs });

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      maxDeletes: 2,
      now: NOW,
      fetchImpl,
    });

    expect(deleted).toEqual([23, 22]);
    expect(result).toMatchObject({ backlog: 4, deleted: 2 });
  });

  it('pages past the first hundred and keeps the cutoff by created time', async () => {
    const runs = Array.from({ length: 150 }, (_, index) => run(100 + index, index * 0.1));
    const { fetchImpl, deleted } = github({ runs });

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      keepDays: 2,
      now: NOW,
      fetchImpl,
    });

    expect(result.total).toBe(150);
    expect(deleted.length).toBe(129);
    expect(deleted[0]).toBe(249);
  });

  it('deletes nothing on a dry run', async () => {
    const runs = [run(30, 5)];
    const { fetchImpl, deleted } = github({ runs });
    const lines = [];

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      dryRun: true,
      now: NOW,
      fetchImpl,
      log: (line) => lines.push(line),
    });

    expect(deleted).toEqual([]);
    expect(result.deleted).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(lines.some((line) => line.startsWith('would delete 30'))).toBe(true);
  });

  it('retries a server error and still deletes the run', async () => {
    const runs = [run(40, 5)];
    let attempts = 0;
    const { fetchImpl, deleted } = github({
      runs,
      deleteReply: () => {
        attempts++;
        return attempts === 1 ? status(502, 'Server Error') : noContent();
      },
    });
    const lines = [];

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      now: NOW,
      fetchImpl,
      log: (line) => lines.push(line),
    });

    expect(attempts).toBe(2);
    expect(deleted).toEqual([40]);
    expect(result.deleted).toBe(1);
    expect(lines.some((line) => line === 'retrying 40 after 502')).toBe(true);
  });

  it('counts a run that is already gone', async () => {
    const runs = [run(50, 5), run(51, 6)];
    const { fetchImpl } = github({ runs, deleteReply: () => status(404, 'Not Found') });

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      now: NOW,
      fetchImpl,
    });

    expect(result.alreadyGone).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.stoppedEarly).toBe(false);
  });

  it('stops before the request budget is spent, and leaves the rest for tomorrow', async () => {
    const runs = Array.from({ length: 10 }, (_, index) => run(60 + index, 5));
    const { fetchImpl } = github({ runs, deleteReply: () => noContent('10') });
    const lines = [];

    const result = await prune({
      token: 'token',
      repo: 'owner/repo',
      now: NOW,
      fetchImpl,
      log: (line) => lines.push(line),
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.deleted).toBeGreaterThan(0);
    expect(result.deleted).toBeLessThan(10);
    expect(lines.some((line) => line.includes('converges on the next run'))).toBe(true);
  });

  it('refuses to run without a token or a repository', async () => {
    await expect(prune({ token: '', repo: 'owner/repo' })).rejects.toThrow('no GITHUB_TOKEN');
    await expect(prune({ token: 'token', repo: '' })).rejects.toThrow('owner/repo');
  });
});
