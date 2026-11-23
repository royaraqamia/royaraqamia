import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUrlExtractClient, TAVILY_EXTRACT_URL } from '@/backend/clients/url-extract';
import { URL_EXTRACT_EVIDENCE_CHARS, WebSearchError } from '@/shared/contracts/web-search';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(results: unknown[]) {
  const fetch = vi.fn(async () => results.shift() ?? response({ results: [] }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('the URL reader (ADR-0214)', () => {
  it('has no client without a key', () => {
    expect(createUrlExtractClient('')).toBeNull();
    expect(createUrlExtractClient(undefined)).toBeNull();
    expect(createUrlExtractClient('tvly-test')).not.toBeNull();
  });

  it('refuses a private address before any request leaves the deployment', async () => {
    const fetch = stubFetch([]);
    await expect(
      createUrlExtractClient('tvly-test')!.extract('http://127.0.0.1/admin', 'ماذا يقول؟')
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts one public URL and returns one numbered, bounded source', async () => {
    const fetch = stubFetch([
      response({
        results: [
          {
            url: 'https://example.com/article',
            raw_content: 'محتوى'.repeat(3000),
            published_date: 'Tue, 17 Nov 2026 10:00:00 GMT',
          },
        ],
        failed_results: [],
        usage: { credits: 1 },
      }),
    ]);

    const result = await createUrlExtractClient('tvly-test')!.extract(
      'https://example.com/article',
      'لخّص هذا المقال'
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TAVILY_EXTRACT_URL);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tvly-test' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      urls: ['https://example.com/article'],
      query: 'لخّص هذا المقال',
      extract_depth: 'basic',
      format: 'text',
      include_published_date: true,
    });
    expect(result.sources).toEqual([
      {
        url: 'https://example.com/article',
        title: 'example.com',
        domain: 'example.com',
        publishedDate: 'Tue, 17 Nov 2026 10:00:00 GMT',
      },
    ]);
    expect(result.evidence).toContain('[1] example.com — example.com');
    expect(result.evidence.length).toBeLessThanOrEqual(URL_EXTRACT_EVIDENCE_CHARS);
  });

  it('returns no evidence when the page could not be read', async () => {
    stubFetch([
      response({
        results: [],
        failed_results: [{ url: 'https://example.com/down', error: 'Failed to retrieve content' }],
      }),
    ]);
    const result = await createUrlExtractClient('tvly-test')!.extract(
      'https://example.com/down',
      'ماذا يقول؟'
    );
    expect(result).toEqual({ sources: [], evidence: '' });
  });

  it('maps a refused credential to the contract error', async () => {
    stubFetch([response({ detail: { error: 'unauthorized' } }, 401)]);
    await expect(
      createUrlExtractClient('tvly-test')!.extract('https://example.com/a', 'ماذا يقول؟')
    ).rejects.toBeInstanceOf(WebSearchError);
  });
});
