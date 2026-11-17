import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebSearchClient,
  scrubPrivateData,
  searchLanguageFor,
  TAVILY_SEARCH_URL,
} from '@/backend/clients/web-search';
import { WEB_SEARCH_EVIDENCE_CHARS } from '@/shared/contracts/web-search';

const SOURCE = {
  title: 'سعر الذهب اليوم',
  url: 'https://example.com/gold',
  content: '∞'.repeat(50),
  published_date: 'Tue, 17 Nov 2026 10:00:00 GMT',
};

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function stubFetch(results: unknown[]) {
  const fetch = vi.fn(async () => results.shift() ?? response({ results: [] }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('the web search client (ADR-0205)', () => {
  it('has no client when the deployment has no key', () => {
    expect(createWebSearchClient('')).toBeNull();
    expect(createWebSearchClient(undefined)).toBeNull();
    expect(createWebSearchClient('tvly-test')).not.toBeNull();
  });

  it('posts the bounded request and returns numbered evidence with source metadata', async () => {
    const fetch = stubFetch([response({ results: [SOURCE], usage: { credits: 1 } })]);
    const client = createWebSearchClient('tvly-test');

    const result = await client!.search('سعر الذهب اليوم', { language: 'ar' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TAVILY_SEARCH_URL);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tvly-test' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: 'سعر الذهب اليوم',
      search_depth: 'basic',
      max_results: 5,
      chunks_per_source: 3,
      include_published_date: true,
      include_raw_content: false,
      include_answer: false,
      language: 'ar',
    });
    expect(result.sources).toEqual([
      {
        title: SOURCE.title,
        url: SOURCE.url,
        domain: 'example.com',
        publishedDate: SOURCE.published_date,
      },
    ]);
    expect(result.evidence).toContain('[1] سعر الذهب اليوم — example.com');
  });

  it('drops a result with no readable page and keeps the rest', async () => {
    stubFetch([
      response({
        results: [
          { ...SOURCE, title: 'no text', content: '' },
          { ...SOURCE, title: 'has text', url: 'https://news.example.org/a', content: 'نص' },
        ],
      }),
    ]);
    const result = await createWebSearchClient('tvly-test')!.search('خبر');

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.domain).toBe('news.example.org');
    expect(result.evidence).toContain('[1] has text');
  });

  it('bounds the whole evidence block to the reserve the turn made', async () => {
    stubFetch([
      response({
        results: Array.from({ length: 5 }, (_, at) => ({
          ...SOURCE,
          title: `source ${at}`,
          url: `https://example.com/${at}`,
          content: '∞'.repeat(9_000),
        })),
      }),
    ]);
    const result = await createWebSearchClient('tvly-test')!.search('query');

    expect(result.sources).toHaveLength(3);
    expect(result.evidence.length).toBeLessThanOrEqual(WEB_SEARCH_EVIDENCE_CHARS);
  });

  it('retries a short rate limit once and obeys a long one', async () => {
    const fetch = stubFetch([
      response({ detail: 'slow down' }, 429, { 'retry-after': '1' }),
      response({ results: [SOURCE] }),
    ]);
    const result = await createWebSearchClient('tvly-test')!.search('query');

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.sources).toHaveLength(1);
  });

  it('does not retry a rate limit that asks for longer than the turn can wait', async () => {
    const fetch = stubFetch([
      response({ detail: 'slow down' }, 429, { 'retry-after': '30' }),
      response({ results: [SOURCE] }),
    ]);

    await expect(createWebSearchClient('tvly-test')!.search('query')).rejects.toMatchObject({
      kind: 'rate_limited',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('maps a plan wall, a refused key and a bad response to their kinds', async () => {
    stubFetch([response({ detail: 'plan' }, 432)]);
    await expect(createWebSearchClient('tvly-test')!.search('query')).rejects.toMatchObject({
      kind: 'plan_limit',
    });

    stubFetch([response({ detail: 'no' }, 401)]);
    await expect(createWebSearchClient('tvly-test')!.search('query')).rejects.toMatchObject({
      kind: 'refused',
    });

    stubFetch([new Response('not json', { status: 200, headers: {} })]);
    await expect(createWebSearchClient('tvly-test')!.search('query')).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('scrubs private details but keeps an ordinary number and a year', () => {
    expect(scrubPrivateData('سعر 1500000 في 2026 لبريد sara@example.com')).not.toContain(
      'sara@example.com'
    );
    expect(scrubPrivateData('سعر 1500000 في 2026 لبريد sara@example.com')).toContain('2026');
    expect(scrubPrivateData('اتصل ب +963 912 345 678 أو 0912-345-678')).not.toContain('963');
    expect(scrubPrivateData('会员 550e8400-e29b-41d4-a716-446655440000 سعر الذهب')).not.toContain(
      '550e8400'
    );
  });

  it('asks for Arabic sources when the question is Arabic', () => {
    expect(searchLanguageFor('سعر الذهب')).toBe('ar');
    expect(searchLanguageFor('gold price')).toBeNull();
  });
});
