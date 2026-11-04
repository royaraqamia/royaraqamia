import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two taps, tested at the only place that can merge.
 *
 * `mergeConfirmed` is the one function a button can reach, so the refusals matter
 * more than the happy path: a row at step 1, a row past its thirty minutes, and a
 * row that names something that is not a merge must all come back without a call
 * to the merge endpoint. The network is stubbed at the module boundary, because
 * the assertion is "was the merge asked for", which is the thing being guaranteed.
 */

const state = { row: null, pull: null, merged: [], patched: [] };

vi.mock('../telegram/store.mjs', () => ({
  findConfirmation: async () => state.row,
  completeConfirmation: async (_id, outcome) => {
    mergedOutcomes.push(outcome);
  },
  advanceConfirmation: async () => {},
  openConfirmation: async () => null,
  noteCallback: async () => {},
}));

vi.mock('../telegram/http.mjs', () => ({
  github: async (path, init) => {
    if (path.includes('/merge')) {
      state.merged.push({ path, body: JSON.parse(init.body) });
      return { merged: true, sha: 'abc' };
    }
    if (path.includes('/issues/')) {
      state.patched.push(path);
      return { state: 'closed' };
    }
    if (path.includes('/git/refs')) return null;
    return state.pull;
  },
  db: async () => [],
}));

const mergedOutcomes = [];

const { mergeConfirmed, nextStep } = await import('../telegram/merge.mjs');

beforeEach(() => {
  state.row = null;
  state.pull = null;
  state.merged.length = 0;
  state.patched.length = 0;
  mergedOutcomes.length = 0;
});

describe('nextStep', () => {
  it('turns a first tap into the second question and a second tap into the merge', () => {
    expect(nextStep({ step: 1 })).toEqual({ step: 2, done: false });
    expect(nextStep({ step: 2 })).toEqual({ step: 2, done: true });
  });
});

describe('mergeConfirmed', () => {
  it('refuses a row that only had one tap, and never calls the merge', async () => {
    state.row = { id: 1, kind: 'merge', step: 1, target: '12', expires_at: future() };
    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result).toEqual({ ok: false, reason: 'unconfirmed' });
    expect(state.merged).toHaveLength(0);
  });

  it('refuses a row past its thirty minutes', async () => {
    state.row = { id: 1, kind: 'merge', step: 2, target: '12', expires_at: past(), expired: true };
    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(state.merged).toHaveLength(0);
  });

  it('refuses a confirmation that is not a merge', async () => {
    state.row = { id: 1, kind: 'deploy', step: 2, target: '12', expires_at: future() };
    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result).toEqual({ ok: false, reason: 'kind' });
    expect(state.merged).toHaveLength(0);
  });

  it('refuses an unknown row', async () => {
    const result = await mergeConfirmed({ confirmationId: 99 });
    expect(result).toEqual({ ok: false, reason: 'unknown' });
  });

  it('merges nothing when the pull request is already merged, and says so', async () => {
    state.row = { id: 1, kind: 'merge', step: 2, target: '12', expires_at: future() };
    state.pull = { number: 12, merged: true, state: 'closed' };
    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result).toMatchObject({ ok: true, already: true });
    expect(state.merged).toHaveLength(0);
  });

  it('merges a live step-two row with the branch reasoning as the message', async () => {
    state.row = { id: 1, kind: 'merge', step: 2, target: '12', expires_at: future() };
    state.pull = {
      number: 12,
      merged: false,
      state: 'open',
      title: 'عنوان',
      body: 'السبب',
      head: { ref: 'telegram/1-fix' },
    };

    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result.ok).toBe(true);
    expect(state.merged).toHaveLength(1);
    expect(state.merged[0].body.merge_method).toBe('squash');
    expect(state.merged[0].body.commit_title).toBe('عنوان (#12)');
    expect(mergedOutcomes).toContain('merged');
  });

  it('closes the issue the body says it closes, because GitHub may not', async () => {
    state.row = { id: 1, kind: 'merge', step: 2, target: '12', expires_at: future() };
    state.pull = {
      number: 12,
      merged: false,
      state: 'open',
      title: 't',
      body: 'Closes #99\n\n## Why\n\nx',
      head: { ref: 'telegram/1-fix' },
    };

    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result.closedIssue).toBe(99);
    expect(state.patched.some((path) => path.endsWith('/issues/99'))).toBe(true);
  });

  it('closes nothing when the body names no issue', async () => {
    state.row = { id: 1, kind: 'merge', step: 2, target: '12', expires_at: future() };
    state.pull = {
      number: 12,
      merged: false,
      state: 'open',
      title: 't',
      body: 'no reference here',
      head: { ref: 'telegram/1-fix' },
    };

    const result = await mergeConfirmed({ confirmationId: 1 });
    expect(result.closedIssue).toBeNull();
    expect(state.patched).toHaveLength(0);
  });
});

function future() {
  return new Date(Date.now() + 10 * 60_000).toISOString();
}

function past() {
  return new Date(Date.now() - 10 * 60_000).toISOString();
}
