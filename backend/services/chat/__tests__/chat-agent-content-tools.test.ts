import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatAgentTool, type ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import { createNewsPreferencesServiceFor, createNewsServiceFor } from '@/backend/config/news';
import { createRatesService } from '@/backend/config/rates';
import { resolveNewsCardCap } from '@/backend/services/news/card-limit';
import type { NewsBoard, NewsStory } from '@/shared/contracts/news';
import type { RateSeries, RatesBoard } from '@/shared/contracts/rates';

/**
 * The two content reads (#1429): the news digest and the rates board.
 *
 * Both are public products, so the only thing a tool can get wrong is telling a
 * member something the site would not show them. These cases pin that: the
 * card allowance cuts the day, an id is a row the retained window still holds,
 * a pair rate is the converter's own arithmetic, and every rate answer carries
 * the date it was read.
 */

vi.mock('@/backend/config/news', () => ({
  createNewsServiceFor: vi.fn(),
  createNewsPreferencesServiceFor: vi.fn(),
}));

vi.mock('@/backend/config/rates', () => ({ createRatesService: vi.fn() }));

// The real card limit runs (it is pure); only the plan read beneath it is a stub.
vi.mock('@/backend/services/news/card-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/backend/services/news/card-limit')>();
  return { ...actual, resolveNewsCardCap: vi.fn() };
});

const BOARD: RatesBoard = {
  base: 'USD',
  fetchedAt: '2026-11-17T06:00:00.000Z',
  providerQuoteDate: '2026-11-16',
  isStale: false,
  currencies: [
    {
      code: 'USD',
      name: 'دولار أمريكي',
      symbol: '$',
      rate: 1,
      previousRate: 1,
      changePct: 0,
      asOf: '2026-11-16',
      parallel: null,
    },
    {
      code: 'SAR',
      name: 'ريال سعودي',
      symbol: 'ر.س',
      rate: 3.75,
      previousRate: 3.75,
      changePct: 0,
      asOf: '2026-11-16',
      parallel: null,
    },
    {
      code: 'SYP',
      name: 'ليرة سورية',
      symbol: 'ل.س',
      rate: 12_500,
      previousRate: 12_400,
      changePct: 0.81,
      asOf: '2026-11-16',
      parallel: {
        rate: 15_000,
        previousRate: 15_100,
        changePct: -0.66,
        asOf: '2026-11-15',
      },
    },
  ],
  metals: [],
};

function story(position: number, headline: string): NewsStory {
  return {
    id: `00000000-0000-4000-8000-00000000000${position}`,
    position,
    category: 'economy',
    region: 'arab',
    headline,
    summary: 'ملخّص الخبر.',
    whyItMatters: 'لأنه يخصّ العضو.',
    sourceId: 'example',
    sourceName: 'مصدر',
    sourceUrl: 'https://example.com/story',
    sourcePublishedAt: '2026-11-16T05:00:00.000Z',
  };
}

const DAY: NewsBoard = {
  day: {
    digest: {
      id: 'digest-1',
      date: '2026-11-16',
      title: 'ملخّص الاثنين',
      lede: 'مقدّمة اليوم.',
      storyCount: 4,
      model: 'test',
      publishedAt: '2026-11-16T03:00:00.000Z',
    },
    stories: [story(1, 'خبر أوّل'), story(2, 'خبر ثانٍ'), story(3, 'خبر ثالث')],
  },
  dates: ['2026-11-16'],
  search: null,
  hasAnyDigest: true,
  preferences: null,
  personal: null,
  cards: null,
};

const SERIES: RateSeries = {
  code: 'SYP',
  kind: 'currency',
  points: [
    { date: '2026-11-14', value: 14_000 },
    { date: '2026-11-15', value: 14_500 },
    { date: '2026-11-16', value: 15_000 },
  ],
};

function turnContext(): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1' };
}

function newsService(overrides: Record<string, unknown> = {}) {
  const service = {
    getBoard: vi.fn(async () => DAY),
    getStory: vi.fn(async () => null),
    ...overrides,
  };
  vi.mocked(createNewsServiceFor).mockReturnValue(service as never);
  return service;
}

function ratesService(overrides: Record<string, unknown> = {}) {
  const service = {
    getBoard: vi.fn(async () => BOARD),
    getSeries: vi.fn(async () => SERIES),
    ...overrides,
  };
  vi.mocked(createRatesService).mockReturnValue(service as never);
  return service;
}

beforeEach(() => {
  vi.mocked(createNewsPreferencesServiceFor).mockReturnValue({
    get: vi.fn(async () => ({ sourceIds: [] })),
  } as never);
  vi.mocked(resolveNewsCardCap).mockResolvedValue(5);
  newsService();
  ratesService();
});

describe('the news reads (#1429)', () => {
  it('answers the day the site would draw, cut to the plan’s cards', async () => {
    vi.mocked(resolveNewsCardCap).mockResolvedValue(2);
    const service = newsService();

    const answer = (await chatAgentTool('get_latest_news')!.run({}, turnContext())) as {
      date: string;
      cards: { cap: number; total: number; shown: number } | null;
      stories: Array<{ id: string; category: string; headline: string }>;
    };

    expect(answer.date).toBe('2026-11-16');
    expect(answer.stories).toHaveLength(2);
    expect(answer.stories[0]?.headline).toBe('خبر أوّل');
    // The work order's "updated, not loosened": the cap still hides the rest.
    expect(answer.cards).toEqual({ cap: 2, total: 3, shown: 2, visitor: false });
    expect(service.getBoard).toHaveBeenCalledWith({}, { sourceIds: [] });
  });

  it('narrows the day to the sources the member kept', async () => {
    vi.mocked(createNewsPreferencesServiceFor).mockReturnValue({
      get: vi.fn(async () => ({ sourceIds: ['example'] })),
    } as never);
    const service = newsService();

    await chatAgentTool('get_latest_news')!.run({}, turnContext());

    expect(service.getBoard).toHaveBeenCalledWith({}, { sourceIds: ['example'] });
  });

  it('asks the service for one category only when the model named one', async () => {
    const service = newsService();

    await chatAgentTool('get_latest_news')!.run({ category: 'tech' }, turnContext());

    expect(service.getBoard).toHaveBeenCalledWith({ category: 'tech' }, { sourceIds: [] });
  });

  it('says the day is empty rather than inventing stories', async () => {
    newsService({
      getBoard: vi.fn(async () => ({ ...DAY, day: null, hasAnyDigest: false })),
    });

    const answer = (await chatAgentTool('get_latest_news')!.run({}, turnContext())) as {
      stories: unknown[];
      has_any_digest: boolean;
    };

    expect(answer.stories).toEqual([]);
    expect(answer.has_any_digest).toBe(false);
  });

  it('reads one story by id, with its day and its source link', async () => {
    newsService({
      getStory: vi.fn(async () => ({ ...story(2, 'خبر ثانٍ'), digestDate: '2026-11-16' })),
    });

    const answer = (await chatAgentTool('get_news_item')!.run(
      { id: '00000000-0000-4000-8000-000000000002' },
      turnContext()
    )) as {
      found: boolean;
      date: string;
      category: string;
      region: string;
      source_url: string;
    };

    expect(answer.found).toBe(true);
    expect(answer.date).toBe('2026-11-16');
    expect(answer.category).toBe('اقتصاد');
    expect(answer.region).toBe('العالم العربي');
    expect(answer.source_url).toBe('https://example.com/story');
  });

  it('answers "not found" for an id the retained window no longer holds', async () => {
    newsService({ getStory: vi.fn(async () => null) });

    const answer = await chatAgentTool('get_news_item')!.run(
      { id: '00000000-0000-4000-8000-000000000009' },
      turnContext()
    );

    expect(answer).toEqual({ found: false });
  });

  it('refuses an argument object that tries to name another member', () => {
    const tool = chatAgentTool('get_latest_news')!;
    expect(tool.schema.safeParse({ user_id: 'someone-else' }).success).toBe(false);
  });
});

describe('the rates reads (#1429)', () => {
  it('answers the dollar in Syrian pounds on both bases, with the date it was read', async () => {
    const answer = (await chatAgentTool('get_rate')!.run(
      { from: 'usd', to: 'syp' },
      turnContext()
    )) as {
      pair: string;
      read_at: string;
      quote_date: string;
      official: { rate: number; as_of: string | null; change_pct: number | null };
      parallel: { rate: number; as_of: string | null; change_pct: number | null } | null;
    };

    expect(answer.pair).toBe('USD/SYP');
    // `convertAmount` divides the two legs, so the last bit is float noise.
    expect(answer.official.rate).toBeCloseTo(12_500);
    expect(answer.official.as_of).toBe('2026-11-16');
    expect(answer.official.change_pct).toBeCloseTo(0.81);
    // The market value keeps its own, older quote date (ADR-0014).
    expect(answer.parallel?.rate).toBeCloseTo(15_000);
    expect(answer.parallel?.as_of).toBe('2026-11-15');
    // "ما سعر الدولار اليوم؟" has to be answerable with the date it was read.
    expect(Number.isNaN(Date.parse(answer.read_at))).toBe(false);
    expect(answer.quote_date).toBe('2026-11-16');
  });

  it('reads a cross pair through the converter’s own arithmetic', async () => {
    const answer = (await chatAgentTool('get_rate')!.run(
      { from: 'SAR', to: 'SYP' },
      turnContext()
    )) as {
      official: { rate: number; change_pct: number | null };
      parallel: unknown;
    };

    expect(answer.official.rate).toBeCloseTo(12_500 / 3.75);
    // A cross pair has no daily change the site shows, and no parallel value.
    expect(answer.official.change_pct).toBeNull();
    expect(answer.parallel).toBeNull();
  });

  it('names the currencies the site follows when the model invents one', async () => {
    const answer = (await chatAgentTool('get_rate')!.run(
      { from: 'USD', to: 'XYZ' },
      turnContext()
    )) as { error: string };

    expect(answer.error).toContain('XYZ');
    expect(answer.error).toContain('SYP');
  });

  it('answers the history as the page draws it, with a summary', async () => {
    const answer = (await chatAgentTool('get_rate_history')!.run(
      { code: 'syp', range: '1W', basis: 'parallel' },
      turnContext()
    )) as {
      found: boolean;
      code: string;
      basis: string;
      columns: string[];
      points: Array<[string, number]>;
      summary: { change_pct: number | null; min: number; max: number };
    };

    expect(answer.found).toBe(true);
    expect(answer.code).toBe('SYP');
    expect(answer.basis).toBe('parallel');
    expect(answer.columns).toEqual(['date', 'value']);
    expect(answer.points).toEqual([
      ['2026-11-14', 14_000],
      ['2026-11-15', 14_500],
      ['2026-11-16', 15_000],
    ]);
    expect(answer.summary.min).toBe(14_000);
    expect(answer.summary.max).toBe(15_000);
    expect(answer.summary.change_pct).toBeCloseTo(((15_000 - 14_000) / 14_000) * 100);
  });

  it('answers "not found" for a code the service does not know', async () => {
    ratesService({ getSeries: vi.fn(async () => null) });

    const answer = await chatAgentTool('get_rate_history')!.run({ code: 'XYZ' }, turnContext());

    expect(answer).toEqual({
      found: false,
      code: 'XYZ',
      range: '1M',
      basis: 'official',
    });
  });
});
