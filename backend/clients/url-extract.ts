import { z } from 'zod';

import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';
import { isPublicHttpUrl } from '@/shared/network';
import {
  URL_EXTRACT_EVIDENCE_CHARS,
  URL_EXTRACT_RETRY_DELAY_MS,
  URL_EXTRACT_TIMEOUT_MS,
  WebSearchError,
  type WebSearchErrorKind,
  type WebSearchResult,
} from '@/shared/contracts/web-search';

/**
 * One page, read by the vendor that already fetches pages for search (ADR-0214).
 *
 * There is no fetcher here: ADR-0206 rejected a generic `fetch_url` because it
 * turns a member's question into an outbound request to any host the model
 * names. Tavily's extractor owns redirects, robots, caching and size; we consume
 * its answer and hand the turn one labeled, length-capped block.
 */
export const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';

const TavilyExtractSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string(),
        raw_content: z.string().default(''),
        published_date: z.string().nullish(),
      })
    )
    .default([]),
  failed_results: z.array(z.object({ url: z.string(), error: z.string().default('') })).default([]),
  usage: z.object({ credits: z.number() }).nullish(),
});

export interface UrlExtractClient {
  extract(
    url: string,
    question: string,
    options?: { signal?: AbortSignal }
  ): Promise<WebSearchResult>;
}

/** No key means no reader, and the turn then declares no `read_url` tool. */
export function createUrlExtractClient(apiKey = env.tavilyApiKey): UrlExtractClient | null {
  if (!apiKey) return null;
  return new TavilyUrlExtractClient(apiKey);
}

class TavilyUrlExtractClient implements UrlExtractClient {
  constructor(private readonly apiKey: string) {}

  async extract(
    url: string,
    question: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<WebSearchResult> {
    // The public-target guard the link previews use. Tavily does the fetching,
    // but a private address must never leave this deployment even inside a
    // request.
    if (!isPublicHttpUrl(url)) {
      throw new WebSearchError('refused', 'the URL is not a public HTTP URL');
    }

    const started = Date.now();
    const response = await this.request(url, question, options);
    const result = response.results.find((item) => item.url === url) ?? response.results[0];
    const text = result?.raw_content.trim() ?? '';
    if (!result || !text || !result.url) return { sources: [], evidence: '' };

    const domain = new URL(result.url).hostname.replace(/^www\./, '');
    const source = {
      url: result.url,
      title: domain,
      domain,
      publishedDate: result.published_date?.trim() || null,
    };
    const label = `[1] ${source.title} — ${source.domain} — ${source.publishedDate ?? 'بلا تاريخ'}\n`;
    const body = text.slice(0, Math.max(0, URL_EXTRACT_EVIDENCE_CHARS - label.length));

    logger.info('URL extract answered', {
      chars: body.length,
      failed: response.failed_results.length,
      credits: response.usage?.credits ?? null,
      ms: Date.now() - started,
    });
    return { sources: [source], evidence: `${label}${body}` };
  }

  private async request(
    url: string,
    question: string,
    options: { signal?: AbortSignal },
    attempt = 0
  ): Promise<z.infer<typeof TavilyExtractSchema>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), URL_EXTRACT_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (options.signal?.aborted) controller.abort();

    try {
      const response = await fetch(TAVILY_EXTRACT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          urls: [url],
          query: question,
          extract_depth: 'basic',
          format: 'text',
          include_published_date: true,
          include_usage: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const kind = errorKindForStatus(response.status);
        const wait = Number(response.headers.get('retry-after') ?? '');
        const shortWait = Number.isFinite(wait) && wait > 0 && wait <= 2 ? wait : null;
        const transient = (kind === 'rate_limited' && shortWait !== null) || response.status >= 500;
        if (attempt === 0 && transient && !options.signal?.aborted) {
          await sleep(shortWait === null ? URL_EXTRACT_RETRY_DELAY_MS : shortWait * 1_000);
          return this.request(url, question, options, 1);
        }
        if (kind === 'refused') {
          logger.error('URL extract refused a credential', { status: response.status });
        } else {
          logger.warn('URL extract refused', { kind, status: response.status });
        }
        throw new WebSearchError(kind, `extract answered ${response.status}`);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new WebSearchError('unavailable', 'the extract response was not readable');
      }
      const parsed = TavilyExtractSchema.safeParse(body);
      if (!parsed.success) {
        throw new WebSearchError('unavailable', 'the extract response was not the shape we read');
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof WebSearchError) throw error;
      const timedOut = controller.signal.aborted;
      if (attempt === 0 && !options.signal?.aborted) {
        await sleep(URL_EXTRACT_RETRY_DELAY_MS);
        return this.request(url, question, options, 1);
      }
      if (timedOut) throw new WebSearchError('timeout', 'the extract did not answer in time');
      throw new WebSearchError(
        'unavailable',
        error instanceof Error ? error.message : 'the extract could not be reached'
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
