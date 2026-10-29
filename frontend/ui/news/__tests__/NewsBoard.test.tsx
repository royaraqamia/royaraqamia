import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { NewsBoard as NewsBoardData } from '@/shared/contracts/news';
import { clearAllSnapshots, listSnapshotKeys } from '@/frontend/shared/local-store/snapshot';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/news',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/frontend/api/news', () => ({
  subscribeToNewsDigestChanges: () => () => {},
}));

import { NewsBoard } from '@/frontend/ui/news/NewsBoard';

const BOARD: NewsBoardData = {
  day: {
    digest: {
      id: 'd-1',
      date: '2026-10-26',
      title: 'digest',
      lede: 'lede',
      storyCount: 1,
      model: 'model',
      publishedAt: '2026-10-26T06:00:00.000Z',
    },
    stories: [
      {
        id: 's-1',
        position: 1,
        category: 'tech',
        region: 'world',
        headline: 'خبر اليوم',
        summary: 'ملخّص الخبر',
        whyItMatters: null,
        sourceId: 'example',
        sourceName: 'Example',
        sourceUrl: 'https://example.com/story',
        sourcePublishedAt: null,
      },
    ],
  },
  dates: ['2026-10-26'],
  search: null,
  hasAnyDigest: true,
  preferences: null,
  personal: null,
  cards: null,
};

function response(cacheControl: string, body: unknown = { board: BOARD }) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'cache-control' ? cacheControl : null),
    },
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  clearAllSnapshots();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The redaction rule, at the seam where it can actually be enforced (#555).
 *
 * `no-store` is the server saying "this answer is for this request only", and a
 * snapshot is a copy of exactly that answer. The surface records only what
 * `requestWithMeta` says may be kept, so a personalised digest — or any other
 * `no-store` read — writes nothing at all.
 */
describe('NewsBoard snapshots', () => {
  it('records a public answer after it paints', async () => {
    fetchMock.mockResolvedValue(response('public, max-age=0, must-revalidate'));

    render(<NewsBoard />);

    await expect(screen.findByText('خبر اليوم')).resolves.toBeTruthy();
    await waitFor(() => expect(listSnapshotKeys()).toContain('royaraqamia:snapshot:public:/news'));
  });

  it('writes nothing for a response marked no-store', async () => {
    fetchMock.mockResolvedValue(response('no-store'));

    render(<NewsBoard />);

    await expect(screen.findByText('خبر اليوم')).resolves.toBeTruthy();
    // Give the recorder effect a turn: the assertion is that it does nothing.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listSnapshotKeys()).toEqual([]);
  });

  it('states how many cards the plan hid', async () => {
    fetchMock.mockResolvedValue(
      response('no-store', {
        board: {
          ...BOARD,
          cards: { cap: 1, total: 3, shown: 1, visitor: true },
        },
      })
    );

    render(<NewsBoard />);

    await expect(screen.findByText(/تعرض لك الصفحة 1 من 3 بطاقة/)).resolves.toBeTruthy();
    expect(screen.getByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fnews'
    );
  });

  it('paints the last-seen digest when the read cannot answer', async () => {
    window.localStorage.setItem(
      'royaraqamia:snapshot:public:/news',
      JSON.stringify({
        v: 1,
        route: '/news',
        data: {
          capturedAt: '2026-10-25T07:00:00.000Z',
          day: {
            digest: {
              id: 'd-0',
              date: '2026-10-25',
              title: 'digest',
              lede: 'lede',
              storyCount: 1,
              model: 'model',
              publishedAt: '2026-10-25T06:00:00.000Z',
            },
            stories: [
              {
                id: 's-0',
                position: 1,
                category: 'tech',
                region: 'world',
                headline: 'خبر الأمس',
                summary: 'ملخّص الخبر',
                whyItMatters: null,
                sourceId: 'example',
                sourceName: 'Example',
                sourceUrl: 'https://example.com/story',
                sourcePublishedAt: null,
              },
            ],
          },
          dates: ['2026-10-25'],
          search: null,
          hasAnyDigest: true,
          categories: ['tech'],
        },
      })
    );
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<NewsBoard />);

    // The rows are there before the failed read settles, and stay after it.
    expect(screen.getByText('خبر الأمس')).toBeTruthy();
    await expect(screen.findAllByText(/هذه نسخة محفوظة من المُلخَّص/)).resolves.not.toHaveLength(0);
    await waitFor(() => expect(screen.getByText('خبر الأمس')).toBeTruthy());
  });

  it('disables the filters a snapshot cannot answer', async () => {
    window.localStorage.setItem(
      'royaraqamia:snapshot:public:/news',
      JSON.stringify({
        v: 1,
        route: '/news',
        data: {
          capturedAt: '2026-10-25T07:00:00.000Z',
          day: {
            digest: {
              id: 'd-0',
              date: '2026-10-25',
              title: 'digest',
              lede: 'lede',
              storyCount: 1,
              model: 'model',
              publishedAt: '2026-10-25T06:00:00.000Z',
            },
            stories: [
              {
                id: 's-0',
                position: 1,
                category: 'tech',
                region: 'world',
                headline: 'خبر الأمس',
                summary: 'ملخّص الخبر',
                whyItMatters: null,
                sourceId: 'example',
                sourceName: 'Example',
                sourceUrl: 'https://example.com/story',
                sourcePublishedAt: null,
              },
            ],
          },
          dates: ['2026-10-25'],
          search: null,
          hasAnyDigest: true,
          categories: ['tech'],
        },
      })
    );
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<NewsBoard />);

    const search = screen.getByRole('combobox') as HTMLInputElement;
    expect(search.disabled).toBe(true);
    const chips = screen.getAllByRole('button');
    expect(chips.some((chip) => (chip as HTMLButtonElement).disabled)).toBe(true);
  });
});
