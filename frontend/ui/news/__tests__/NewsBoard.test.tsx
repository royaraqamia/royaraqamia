import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { NewsBoard as NewsBoardData } from '@/shared/contracts/news';
import {
  clearAllSnapshots,
  listSnapshotKeys,
  readPublicSnapshot,
  writePublicSnapshot,
} from '@/frontend/shared/local-store/snapshot';
import { toNewsDigestSnapshot, type NewsDigestSnapshot } from '@/frontend/ui/news/news-snapshot';

const { push, replace, navigation } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  /** The address bar the mocked router reads; a test moves it and re-renders. */
  navigation: { search: '' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/news',
  useSearchParams: () => new URLSearchParams(navigation.search),
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

function failedResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'cache-control' ? 'no-store' : null),
    },
    json: async () => body,
  } as unknown as Response;
}

/** A digest this device saw before the failed read, written by the store itself. */
function storeDigest(): NewsDigestSnapshot {
  const stored = toNewsDigestSnapshot(BOARD, '2026-10-25T07:00:00.000Z');
  writePublicSnapshot('/news', stored);
  return stored;
}

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  clearAllSnapshots();
  fetchMock.mockReset();
  navigation.search = '';
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

  it('leaves the stored digest in place when the server cannot read the board', async () => {
    const stored = storeDigest();
    fetchMock.mockResolvedValue(
      failedResponse(503, {
        success: false,
        error: 'تعذّر تحميل ملخّص الأخبار. جرّب المحاولة مرة أخرى.',
      })
    );

    render(<NewsBoard />);

    expect(screen.getByText('خبر اليوم')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'إعادة المحاولة' }).length).toBeGreaterThan(0);
    await waitFor(() => expect(readPublicSnapshot<NewsDigestSnapshot>('/news')).toEqual(stored));
  });

  it('does not record a 200 that carries neither a digest nor a search', async () => {
    fetchMock.mockResolvedValue(
      response('public, max-age=0, must-revalidate', {
        board: { ...BOARD, day: null, search: null, dates: [], hasAnyDigest: false },
      })
    );

    render(<NewsBoard />);

    await expect(screen.findByText('لا يوجد مُلخَّص لهذا اليوم')).resolves.toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listSnapshotKeys()).toEqual([]);
  });

  it('does not clear an existing digest when a 200 carries neither a digest nor a search', async () => {
    const stored = storeDigest();
    fetchMock.mockResolvedValue(
      response('public, max-age=0, must-revalidate', {
        board: { ...BOARD, day: null, search: null, dates: [], hasAnyDigest: true },
      })
    );

    render(<NewsBoard />);

    await expect(screen.findByText('لا يوجد مُلخَّص لهذا اليوم')).resolves.toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readPublicSnapshot<NewsDigestSnapshot>('/news')).toEqual(stored);
  });
});

/**
 * A board belongs to the URL that asked for it (#640).
 *
 * The read effect depended on the URL but the board it produced did not, so a
 * filter change kept painting the previous URL's rows while the next read was
 * in flight — and, because a failed read left the board in place, after it too,
 * unlabelled by `stale`. A reader moving from one day to another could see
 * yesterday's digest under today's date, with today's filters above it.
 */
describe('NewsBoard and the URL a read answers', () => {
  it("never paints a previous URL's digest after the filters change", async () => {
    fetchMock.mockResolvedValueOnce(
      response('public, max-age=0, must-revalidate', {
        board: { ...BOARD, personal: { enabled: true, available: true, active: true } },
      })
    );

    let failSecondRead: (error: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((_resolve, reject) => {
        failSecondRead = reject;
      })
    );

    const { rerender } = render(<NewsBoard />);

    await expect(screen.findByText('خبر اليوم')).resolves.toBeTruthy();
    await expect(screen.findByText('مُلخَّصك الخاص')).resolves.toBeTruthy();

    // The reader picks another day: same component, new URL, no answer yet.
    navigation.search = 'date=2026-10-27';
    rerender(<NewsBoard />);

    // A's stories are not painted under B's filters while B loads…
    expect(screen.queryByText('خبر اليوم')).toBeNull();
    // …and A's reader-scoped half is not carried across either.
    expect(screen.queryByText('مُلخَّصك الخاص')).toBeNull();

    await act(async () => {
      failSecondRead(new TypeError('Failed to fetch'));
    });

    // …nor after B fails. The failure is named, and what sits under it is B's
    // (here: nothing, so the loading frame) rather than A's digest.
    await expect(screen.findAllByText(/تعذّر تحميل/)).resolves.not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'إعادة المحاولة' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('خبر اليوم')).toBeNull();
    expect(screen.queryByText('مُلخَّصك الخاص')).toBeNull();
  });
});
