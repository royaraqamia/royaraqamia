import { describe, it, expect } from 'vitest';
import { parseArgs, selectForDeletion } from '../prune-deployments.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-12T00:00:00.000Z');

function deployment({ id, ageDays, target = 'preview', rollbackCandidate = false }) {
  return {
    uid: id,
    id,
    url: `${id}.vercel.app`,
    target,
    rollbackCandidate,
    created: NOW - ageDays * DAY,
  };
}

describe('prune-deployments', () => {
  it('keeps the newest N deployments and offers the rest, oldest first', () => {
    const deployments = Array.from({ length: 30 }, (_, index) =>
      deployment({ id: `dpl_${index}`, ageDays: index + 2 })
    );

    const { deletable } = selectForDeletion({
      deployments,
      keep: 5,
      minAgeMs: DAY,
      now: NOW,
    });

    const keptIds = deployments
      .filter((candidate) => !deletable.some((removed) => removed.id === candidate.id))
      .map((candidate) => candidate.id);
    expect(keptIds).toEqual(['dpl_0', 'dpl_1', 'dpl_2', 'dpl_3', 'dpl_4']);
    expect(deletable.map((candidate) => candidate.id)).toEqual(
      Array.from({ length: 25 }, (_, index) => `dpl_${29 - index}`)
    );
  });

  it('never deletes a rollback candidate, the newest production deployment, or a fresh deployment', () => {
    const deployments = [
      deployment({ id: 'dpl_newest', ageDays: 0.01 }),
      deployment({ id: 'dpl_rollback', ageDays: 40, rollbackCandidate: true }),
      deployment({ id: 'dpl_prod_latest', ageDays: 41, target: 'production' }),
      deployment({ id: 'dpl_old_preview', ageDays: 42 }),
    ];

    const { deletable } = selectForDeletion({
      deployments,
      keep: 1,
      minAgeMs: DAY,
      now: NOW,
    });

    expect(deletable.map((candidate) => candidate.id)).toEqual(['dpl_old_preview']);
  });

  it('keeps the newest production deployment even when it falls outside the keep window', () => {
    const deployments = [
      deployment({ id: 'dpl_a', ageDays: 10 }),
      deployment({ id: 'dpl_prod', ageDays: 30, target: 'production' }),
    ];

    const { deletable } = selectForDeletion({ deployments, keep: 0, minAgeMs: DAY, now: NOW });

    expect(deletable.map((candidate) => candidate.id)).toEqual(['dpl_a']);
  });
});

describe('parseArgs', () => {
  it('treats a bare flag as boolean and parses --key=value', () => {
    expect(parseArgs(['--dry-run', '--keep=25', '--min-age-days=3'])).toEqual({
      'dry-run': true,
      keep: '25',
      'min-age-days': '3',
    });
  });
});
