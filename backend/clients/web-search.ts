import { z } from 'zod';

import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';
import {
  WEB_SEARCH_CHUNKS_PER_SOURCE,
  WEB_SEARCH_EVIDENCE_CHARS,
  WEB_SEARCH_EVIDENCE_SOURCES,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_QUERY_MIN,
  WEB_SEARCH_TIMEOUT_MS,
  WebSearchError,
  type WebSearchErrorKind,
  type WebSearchResult,
  type WebSource,
} from '@/shared/contracts/web-search';

/**
 * The web, as one request (ADR-0206).
 *
 * The vendor is Tavily: an LLM-facing search that returns, per result, a
 * title, a URL, a publish date and a few semantically selected chunks of the
 * page. That last field is why there is no page fetcher here — the vendor has
 * already opened the page, and this deployment never makes an outbound request
 * to a host the model named.
 *
 * The interface is the seam. Brave's `llm/context` answers the same question,
 * so switching vendors is another implementation of `WebSearchClient` and a
 * line in the composition root, not a change to the turn.
 */

export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

/** The vendor's response, as much of it as this client reads. */
const TavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().default(''),
        url: z.string(),
        content: z.string().default(''),
        published_date: z.string().nullish(),
      })
    )
    .default([]),
  usage: z.object({ credits: z.number() }).nullish(),
});

type TavilyResult = z.infer<typeof TavilyResponseSchema>['results'][number];

export interface WebSearchClient {
  search(
    query: string,
    options?: { language?: string | null; signal?: AbortSignal }
  ): Promise<WebSearchResult>;
}

/**
 * The public seam. A deployment with no key has no client, and the turn then
 * declares no tool — the same rule the app tools follow (ADR-0155).
 */
export function createWebSearchClient(apiKey = env.tavilyApiKey): WebSearchClient | null {
  if (!apiKey) return null;
  return new TavilyWebSearchClient(apiKey);
}

class TavilyWebSearchClient implements WebSearchClient {
  constructor(private readonly apiKey: string) {}

  async search(
    query: string,
    options: { language?: string | null; signal?: AbortSignal } = {}
  ): Promise<WebSearchResult> {
    const cleaned = scrubPrivateData(query);
    if (cleaned.length < WEB_SEARCH_QUERY_MIN) {
      throw new WebSearchError(
        'refused',
        'the query says nothing once private details are removed'
      );
    }

    const started = Date.now();
    const response = await this.request(cleaned, options);
    const results = response.results;

    const sources: WebSource[] = [];
    let budget = WEB_SEARCH_EVIDENCE_CHARS;
    const blocks: string[] = [];
    // Two of the characters between blocks are part of the evidence too.
    const perSource = Math.floor(
      (WEB_SEARCH_EVIDENCE_CHARS - (WEB_SEARCH_EVIDENCE_SOURCES - 1) * 2) /
        WEB_SEARCH_EVIDENCE_SOURCES
    );

    for (const result of results) {
      if (sources.length >= WEB_SEARCH_EVIDENCE_SOURCES) break;
      const text = result.content.trim();
      // A result with no text is a link the model cannot read: it is not
      // evidence, so it is not a source the reply may cite.
      if (!text || !result.url) continue;

      const source = toSource(result);
      if (!source) continue;

      const index = sources.length + 1;
      const label = `[${index}] ${source.title || source.domain} — ${source.domain} — ${source.publishedDate ?? 'بلا تاريخ'}\n`;
      // The label and the blank line between blocks are paid out of the same
      // reserve, so a long title cannot push the text past what the turn gave up.
      const separator = blocks.length > 0 ? 2 : 0;
      const room = Math.max(0, budget - label.length - separator);
      const body = text.slice(0, Math.max(0, Math.min(room, perSource)));
      if (!body) break;

      sources.push(source);
      blocks.push(`${label}${body}`);
      budget -= label.length + body.length + separator;
      if (budget <= 0) break;
    }

    logger.info('Web search answered', {
      results: results.length,
      sources: sources.length,
      credits: response.usage?.credits ?? null,
      ms: Date.now() - started,
    });

    return { sources, evidence: blocks.join('\n\n') };
  }

  private async request(
    query: string,
    options: { language?: string | null; signal?: AbortSignal },
    attempt = 0
  ): Promise<z.infer<typeof TavilyResponseSchema>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const response = await fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          max_results: WEB_SEARCH_MAX_RESULTS,
          chunks_per_source: WEB_SEARCH_CHUNKS_PER_SOURCE,
          include_published_date: true,
          include_raw_content: false,
          include_answer: false,
          include_usage: true,
          ...(options.language ? { language: options.language } : {}),
        }),
        signal: controller.signal,
      });

      // One retry, and only when the vendor says the wait is shorter than the
      // turn would notice. A longer window is a search that did not happen.
      if (response.status === 429 && attempt === 0) {
        const wait = Number(response.headers.get('retry-after') ?? '');
        if (Number.isFinite(wait) && wait > 0 && wait <= 2) {
          await sleep(wait * 1_000);
          return this.request(query, options, 1);
        }
      }

      if (!response.ok) {
        const kind = errorKindForStatus(response.status);
        logger.warn('Web search refused', { kind, status: response.status });
        throw new WebSearchError(kind, `search answered ${response.status}`);
      }

      const parsed = TavilyResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new WebSearchError('unavailable', 'the search response was not the shape we read');
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof WebSearchError) throw error;
      if (controller.signal.aborted) {
        throw new WebSearchError('timeout', 'the search did not answer in time');
      }
      throw new WebSearchError(
        'unavailable',
        error instanceof Error ? error.message : 'the search could not be reached'
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', forwardAbort);
    }
  }
}

function errorKindForStatus(status: number): WebSearchErrorKind {
  if (status === 401 || status === 403) return 'refused';
  if (status === 432 || status === 433) return 'plan_limit';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}

function toSource(result: TavilyResult): WebSource | null {
  let domain: string;
  try {
    domain = new URL(result.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!domain) return null;
  return {
    url: result.url,
    title: result.title.trim(),
    domain,
    publishedDate: result.published_date?.trim() || null,
  };
}

/**
 * Nothing the member told us in private leaves the deployment inside a query.
 * The prompt already forbids it; this is the second wall, and it is deliberately
 * narrow — a year, a price and an ordinary number survive.
 */
export function scrubPrivateData(query: string): string {
  return query
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\+\d[\d\s\-()]{6,18}\d/g, ' ')
    .replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Arabic asks for Arabic sources; the vendor boosts the language it is given. */
export function searchLanguageFor(query: string): string | null {
  return /[\u0600-\u06ff]/.test(query) ? 'ar' : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
