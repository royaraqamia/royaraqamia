import { describe, expect, it } from 'vitest';

import {
  RECALL_HALF_LIFE_DAYS,
  RECALL_MAX_ITEMS,
  RECALL_SIMILARITY_FLOOR,
  rankRecall,
  recallBlock,
  recallScore,
  type RecalledMemory,
} from '@/backend/shared/domain/agent-memory';

/**
 * The ranking behind cited recall (ADR-0182 decision 3, #1510): a floor on the
 * similarity, a decay over the survivors, and six as the hard cap. These are
 * pure, so they are asserted here rather than through a turn.
 */

const NOW = Date.parse('2026-11-15T12:00:00.000Z');

function fact(
  id: string,
  similarity: number,
  updatedAt = '2026-11-14T12:00:00.000Z'
): RecalledMemory {
  return { memoryId: id, text: `fact ${id}`, similarity, updatedAt };
}

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

describe('recallScore', () => {
  it('halves the weight every half-life, and leaves a fresh fact at its similarity', () => {
    expect(recallScore(fact('fresh', 0.8, daysAgo(0)), NOW)).toBeCloseTo(0.8);
    expect(recallScore(fact('half', 0.8, daysAgo(RECALL_HALF_LIFE_DAYS)), NOW)).toBeCloseTo(0.4);
    expect(recallScore(fact('two', 0.8, daysAgo(RECALL_HALF_LIFE_DAYS * 2)), NOW)).toBeCloseTo(0.2);
  });

  it('does not reward a clock that is ahead of the fact', () => {
    expect(recallScore(fact('future', 0.8, daysAgo(-5)), NOW)).toBeCloseTo(0.8);
  });
});

describe('rankRecall', () => {
  it('drops everything below the floor, however high it ranked', () => {
    const candidates = [
      fact('below', RECALL_SIMILARITY_FLOOR - 0.001),
      fact('at-the-floor', RECALL_SIMILARITY_FLOOR),
    ];

    expect(rankRecall(candidates, NOW).map((item) => item.memoryId)).toEqual(['at-the-floor']);
  });

  it('orders by decayed similarity among the survivors', () => {
    const candidates = [
      fact('stale-strong', 0.9, daysAgo(RECALL_HALF_LIFE_DAYS * 4)),
      fact('recent', 0.7, daysAgo(2)),
    ];

    expect(rankRecall(candidates, NOW).map((item) => item.memoryId)).toEqual([
      'recent',
      'stale-strong',
    ]);
  });

  it('never returns more than six, whatever max is asked', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => fact(`f${index}`, 0.9));

    expect(rankRecall(candidates, NOW, 20)).toHaveLength(RECALL_MAX_ITEMS);
    expect(rankRecall(candidates, NOW, 3)).toHaveLength(3);
    expect(rankRecall(candidates, NOW, 0)).toEqual([]);
  });

  it('ignores a similarity that is not a number, and keeps a tie deterministic', () => {
    const candidates = [
      fact('broken', Number.NaN),
      fact('older', 0.9, daysAgo(10)),
      fact('newer', 0.9, daysAgo(1)),
    ];

    expect(rankRecall(candidates, NOW).map((item) => item.memoryId)).toEqual(['newer', 'older']);
  });
});

describe('recallBlock', () => {
  it('is nothing at all when there is nothing to recall', () => {
    expect(recallBlock([])).toBe('');
  });

  it('names each fact and its source on one line', () => {
    const block = recallBlock([
      fact('a', 0.9, '2026-10-03T09:00:00.000Z'),
      fact('b', 0.8, '2026-10-04T09:00:00.000Z'),
    ]);

    const lines = block.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('fact a');
    expect(lines[1]).toContain('من محادثتنا في');
    expect(lines[1]).toMatch(/3 أكتوبر/);
    expect(lines[2]).toMatch(/4 أكتوبر/);
  });

  it('keeps an unreadable date from inventing a source it cannot name', () => {
    const block = recallBlock([fact('a', 0.9, 'not-a-date')]);

    expect(block).toContain('من محفوظاتك');
    expect(block).not.toContain('في  ');
  });
});
