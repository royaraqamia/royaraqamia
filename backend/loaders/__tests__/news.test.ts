import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveOptional = vi.fn();
const mockPreferencesGet = vi.fn();
const mockGetBoard = vi.fn();
const mockPersonalGet = vi.fn();

vi.mock('@/backend/config/identity', () => ({
  identity: { resolveOptional: () => mockResolveOptional() },
}));

vi.mock('@/backend/config/supabase', () => ({
  getPublicSupabase: () => ({}),
}));

vi.mock('@/backend/config/news', () => ({
  createNewsServiceFor: () => ({
    getBoard: (...args: unknown[]) => mockGetBoard(...args),
  }),
  createNewsPreferencesServiceFor: () => ({
    get: (...args: unknown[]) => mockPreferencesGet(...args),
  }),
  createNewsPersonalDigestServiceFor: () => ({
    get: (...args: unknown[]) => mockPersonalGet(...args),
  }),
}));

import { loadNewsBoard } from '@/backend/loaders/news';
import type {
  NewsBoard,
  NewsDay,
  NewsPreferencesEffect,
  NewsSourcePreferences,
} from '@/shared/contracts/news';

const READER_PREFERENCES: NewsSourcePreferences = {
  sourceIds: ['aljazeera-ar'],
  personalEnabled: true,
};

const PREFERENCES_EFFECT: NewsPreferencesEffect = {
  selectedSources: 1,
  filtered: true,
  fellBack: false,
};

function day(date: string, id: string): NewsDay {
  return {
    digest: {
      id,
      date,
      title: 'ملخّص',
      lede: 'أهم ما حدث.',
      storyCount: 0,
      model: 'opencode-go/deepseek-v4.1-flash#high',
      publishedAt: `${date}T04:00:00.000Z`,
    },
    stories: [],
  };
}

function board(overrides: Partial<NewsBoard> = {}): NewsBoard {
  return {
    day: null,
    dates: [],
    search: null,
    hasAnyDigest: true,
    preferences: null,
    personal: null,
    limit: null,
    ...overrides,
  };
}

function session() {
  return {
    user: { id: 'user-1', email: 'reader@example.com' },
    client: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveOptional.mockResolvedValue(session());
  mockPreferencesGet.mockResolvedValue(READER_PREFERENCES);
  mockPersonalGet.mockResolvedValue(null);
});

/**
 * The default `mine` view must not present yesterday's Personal Digest as
 * today's briefing. `getLatest` has no date floor, so the loader is where the
 * personal day is compared with the shared day the board is actually showing
 * (#600).
 */
describe('loadNewsBoard personal digest selection', () => {
  it('serves the shared day when the personal digest is from an earlier day', async () => {
    const shared = board({
      day: day('2026-10-26', 'shared-26'),
      preferences: PREFERENCES_EFFECT,
    });
    mockGetBoard.mockResolvedValue(shared);
    mockPersonalGet.mockResolvedValue(day('2026-10-25', 'personal-25'));

    const result = await loadNewsBoard({}, 'mine');

    expect(result.day).toEqual(shared.day);
    expect(result.preferences).toEqual(PREFERENCES_EFFECT);
    expect(result.personal).toEqual({ enabled: true, available: false, active: false });
  });

  it('serves the personal digest when it is for the shared day', async () => {
    const personal = day('2026-10-26', 'personal-26');
    mockGetBoard.mockResolvedValue(board({ day: day('2026-10-26', 'shared-26') }));
    mockPersonalGet.mockResolvedValue(personal);

    const result = await loadNewsBoard({}, 'mine');

    expect(result.day).toEqual(personal);
    expect(result.preferences).toBeNull();
    expect(result.personal).toEqual({ enabled: true, available: true, active: true });
  });

  it('keeps the personal digest for an explicit day', async () => {
    const personal = day('2026-10-20', 'personal-20');
    mockGetBoard.mockResolvedValue(board({ day: day('2026-10-20', 'shared-20') }));
    mockPersonalGet.mockResolvedValue(personal);

    const result = await loadNewsBoard({ date: '2026-10-20' }, 'mine');

    expect(mockPersonalGet).toHaveBeenCalledWith('user-1', { date: '2026-10-20' });
    expect(result.day).toEqual(personal);
    expect(result.personal).toEqual({ enabled: true, available: true, active: true });
  });

  it('falls back to the shared digest for an explicit day without a personal one', async () => {
    const shared = board({
      day: day('2026-10-20', 'shared-20'),
      preferences: PREFERENCES_EFFECT,
    });
    mockGetBoard.mockResolvedValue(shared);
    mockPersonalGet.mockResolvedValue(null);

    const result = await loadNewsBoard({ date: '2026-10-20' }, 'mine');

    expect(result.day).toEqual(shared.day);
    expect(result.preferences).toEqual(PREFERENCES_EFFECT);
    expect(result.personal).toEqual({ enabled: true, available: false, active: false });
  });

  it('may show the latest personal digest when there is no shared digest', async () => {
    const personal = day('2026-10-25', 'personal-25');
    mockGetBoard.mockResolvedValue(board({ day: null }));
    mockPersonalGet.mockResolvedValue(personal);

    const result = await loadNewsBoard({}, 'mine');

    expect(result.day).toEqual(personal);
    expect(result.personal).toEqual({ enabled: true, available: true, active: true });
  });

  it('reports a matching personal digest as available but not active in the public view', async () => {
    const shared = board({ day: day('2026-10-26', 'shared-26') });
    mockGetBoard.mockResolvedValue(shared);
    mockPersonalGet.mockResolvedValue(day('2026-10-26', 'personal-26'));

    const result = await loadNewsBoard({}, 'public');

    expect(result.day).toEqual(shared.day);
    expect(result.personal).toEqual({ enabled: true, available: true, active: false });
  });
});
