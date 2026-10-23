import { z } from 'zod';

import { toLatinDigits } from './text';

/**
 * The daily news digest as the page consumes it.
 *
 * The rows are written by `.github/workflows/news-digest.yml`, never by a
 * signed-in user (see `supabase/migrations/20261023130000_create_news_digests.sql`),
 * so this contract is a read shape plus the query the page accepts. The
 * workflow validates the model's output against its own copy of the story shape
 * in `scripts/news/validate-digest.mjs`; that copy is deliberately not imported
 * from here because the script runs before `node_modules` holds a TypeScript
 * build step, but the categories and regions below are what both sides agree on.
 */

export const NEWS_CATEGORIES = [
  'tech',
  'politics',
  'religion',
  'economy',
  'world',
  'other',
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const NEWS_REGIONS = ['arab', 'islamic', 'world'] as const;

export type NewsRegion = (typeof NEWS_REGIONS)[number];

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  tech: 'تقنية',
  politics: 'سياسة',
  religion: 'دين',
  economy: 'اقتصاد',
  world: 'العالم',
  other: 'منوّع',
};

export const NEWS_REGION_LABELS: Record<NewsRegion, string> = {
  arab: 'العالم العربي',
  islamic: 'العالم الإسلامي',
  world: 'العالم',
};

/** The narrowest and widest digest the workflow is allowed to publish. */
export const NEWS_DIGEST_MIN_STORIES = 8;
export const NEWS_DIGEST_MAX_STORIES = 12;

/** How long a digest survives; the sweep in 20261023130200 enforces it. */
export const NEWS_RETENTION_DAYS = 30;

/** One story's stored shape, camelCased for the client boundary. */
export interface NewsStory {
  id: string;
  position: number;
  category: NewsCategory;
  region: NewsRegion;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
}

export interface NewsDigest {
  id: string;
  date: string;
  title: string;
  lede: string;
  storyCount: number;
  model: string;
  publishedAt: string;
}

export interface NewsDay {
  digest: NewsDigest;
  stories: NewsStory[];
}

/** A search hit, carried with the day it belongs to so results can be dated. */
export interface NewsSearchHit extends NewsStory {
  digestDate: string;
}

export interface NewsSearch {
  query: string;
  category: NewsCategory | null;
  hits: NewsSearchHit[];
  /** True when more hits exist than the page asked for. */
  truncated: boolean;
}

/**
 * What the page renders for one request. `day` is the selected day's digest
 * (the latest when no `date` was asked for, or the latest day a filter leaves
 * non-empty), `dates` is the archive strip, and `search` replaces both when the
 * reader typed a query.
 */
export interface NewsBoard {
  day: NewsDay | null;
  dates: string[];
  search: NewsSearch | null;
  /** Whether any digest exists at all, so the page can tell "not yet" from "empty". */
  hasAnyDigest: boolean;
}

export const NEWS_SEARCH_LIMIT = 60;

/** `YYYY-MM-DD`, the only date form the page accepts in its URL. */
export const NEWS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const newsQuerySchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  category: z.enum(NEWS_CATEGORIES).optional().catch(undefined),
  date: z.string().regex(NEWS_DATE_PATTERN).optional().catch(undefined),
});

export type NewsQuery = z.infer<typeof newsQuerySchema>;

export function isNewsCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}

export function isNewsRegion(value: string): value is NewsRegion {
  return (NEWS_REGIONS as readonly string[]).includes(value);
}

/**
 * Reduces a typed query to what may reach PostgREST.
 *
 * The search is built as a `.or(headline_ar.ilike.%q%,summary_ar.ilike.%q%)`
 * filter, so a comma, parenthesis or quote in the query would break the filter
 * syntax rather than match text — and `%`/`_` would silently act as wildcards.
 * Keeping letters, digits, spaces and hyphens is enough for Arabic and for the
 * Latin names that appear inside Arabic copy, and leaves nothing that needs
 * escaping.
 */
export function sanitizeNewsQuery(value: string): string {
  return toLatinDigits(value)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** The Damascus day a timestamp falls in, as `YYYY-MM-DD`. */
export function damascusDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** A digest date for display, read in UTC because the column is a plain date. */
export function formatDigestDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

/** A short form for the archive strip: the day and month only. */
export function formatDigestDayShort(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(parsed);
}
