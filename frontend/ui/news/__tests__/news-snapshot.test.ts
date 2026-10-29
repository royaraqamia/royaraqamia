import { describe, it, expect } from 'vitest';
import {
  toNewsDigestSnapshot,
  trimNewsSnapshot,
  uniqueCategories,
} from '@/frontend/ui/news/news-snapshot';
import type { NewsBoard, NewsStory } from '@/shared/contracts/news';

const CAPTURED_AT = '2026-10-26T09:15:00.000Z';

function story(id: string, category: NewsStory['category'], pad = ''): NewsStory {
  return {
    id,
    position: 1,
    category,
    region: 'world',
    headline: `headline ${id}`,
    summary: `summary ${id} ${pad}`,
    whyItMatters: null,
    sourceId: 'example',
    sourceName: 'Example',
    sourceUrl: 'https://example.com/story',
    sourcePublishedAt: null,
  };
}

const BOARD: NewsBoard = {
  day: {
    digest: {
      id: 'd-1',
      date: '2026-10-26',
      title: 'digest',
      lede: 'lede',
      storyCount: 3,
      model: 'model',
      publishedAt: CAPTURED_AT,
    },
    stories: [story('s-1', 'tech'), story('s-2', 'politics'), story('s-3', 'tech')],
  },
  dates: ['2026-10-26', '2026-10-25'],
  search: null,
  hasAnyDigest: true,
  preferences: { selectedSources: 2, filtered: true, fellBack: false },
  personal: { enabled: true, available: true, active: false },
  limit: null,
};

/**
 * What `/news` may record (#555).
 *
 * The digest is published content; `personal` and `preferences` are the parts
 * that describe *this* reader. The snapshot shape has no field for them, which is
 * the rule made structural: the writer takes the rendered rows, and there is no
 * way to render an account id into it.
 */
describe('toNewsDigestSnapshot', () => {
  it('keeps the digest, the archive and the chips the day contains', () => {
    const snapshot = toNewsDigestSnapshot(BOARD, CAPTURED_AT);

    expect(snapshot.capturedAt).toBe(CAPTURED_AT);
    expect(snapshot.day?.stories.map((entry) => entry.id)).toEqual(['s-1', 's-2', 's-3']);
    expect(snapshot.dates).toEqual(['2026-10-26', '2026-10-25']);
    expect(snapshot.categories).toEqual(['tech', 'politics']);
    expect(snapshot.hasAnyDigest).toBe(true);
  });

  it('holds nothing about the reader', () => {
    const snapshot = toNewsDigestSnapshot(BOARD, CAPTURED_AT);
    const serialised = JSON.stringify(snapshot);

    expect(snapshot).not.toHaveProperty('personal');
    expect(snapshot).not.toHaveProperty('preferences');
    expect(serialised).not.toContain('"personal"');
    expect(serialised).not.toContain('"preferences"');
    expect(serialised).not.toContain('selectedSources');
  });

  it('takes the categories from the search hits while searching', () => {
    const snapshot = toNewsDigestSnapshot(
      {
        ...BOARD,
        day: null,
        search: {
          query: 'اتفاق',
          category: null,
          hits: [{ ...story('h-1', 'economy'), digestDate: '2026-10-24' }],
          truncated: false,
        },
      },
      CAPTURED_AT
    );

    expect(snapshot.categories).toEqual(['economy']);
  });
});

describe('trimNewsSnapshot', () => {
  it('drops the tail of a digest that cannot fit', () => {
    const snapshot = toNewsDigestSnapshot(
      {
        ...BOARD,
        day: {
          ...BOARD.day!,
          stories: Array.from({ length: 40 }, (_, i) => story(`s-${i}`, 'tech')),
        },
      },
      CAPTURED_AT
    );

    const trimmed = trimNewsSnapshot(snapshot);

    expect(trimmed?.day?.stories).toHaveLength(16);
    expect(trimmed?.day?.stories[0]?.id).toBe('s-0');
  });

  it('drops the tail of a search that cannot fit', () => {
    const snapshot = toNewsDigestSnapshot(
      {
        ...BOARD,
        day: null,
        search: {
          query: 'اتفاق',
          category: null,
          hits: Array.from({ length: 40 }, (_, i) => ({
            ...story(`h-${i}`, 'tech'),
            digestDate: '2026-10-26',
          })),
          truncated: true,
        },
      },
      CAPTURED_AT
    );

    const trimmed = trimNewsSnapshot(snapshot);

    expect(trimmed?.search?.hits).toHaveLength(16);
    // The query stays: a stale view must still say what it answered.
    expect(trimmed?.search?.query).toBe('اتفاق');
  });

  it('gives up on a board with nothing in it', () => {
    const snapshot = toNewsDigestSnapshot(
      { ...BOARD, day: null, search: null, hasAnyDigest: false },
      CAPTURED_AT
    );

    expect(trimNewsSnapshot(snapshot)).toBeNull();
  });
});

describe('uniqueCategories', () => {
  it('keeps the page’s own order rather than first appearance', () => {
    expect(uniqueCategories(['politics', 'tech', 'politics'])).toEqual(['tech', 'politics']);
  });
});
