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
  /** The catalogue id the story came from, which is what a reader's selection filters on. */
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
}

/**
 * One entry of the source catalogue (`data/news/sources.json`, plus whatever an
 * admin approved in `news_sources`), as the reader-facing selection offers it.
 *
 * The feed URL and freshness window stay on the server: a reader picks a
 * publication by name, and nothing in the picker needs to know where it is
 * fetched from.
 */
export interface NewsSource {
  id: string;
  name: string;
  category: NewsCategory;
  region: NewsRegion;
  tier: 1 | 2;
}

/** The ids a signed-in reader kept; empty means "every source". */
export interface NewsSourcePreferences {
  sourceIds: string[];
  /** True once the reader asked for a digest of their own (ADR-0079). */
  personalEnabled: boolean;
}

/**
 * How many stories a reader's own selection must leave before the page stops
 * honouring it. Below this the day is the full digest with a notice: filtering
 * is a preference, not a way to empty the page.
 */
export const NEWS_PERSONAL_MIN_STORIES = 3;

/** Catalogue ids are slugs; the pattern keeps a stored array free of anything else. */
export const NEWS_SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** The ceiling the table's check constraint enforces, mirrored for the contract. */
export const NEWS_MAX_SELECTED_SOURCES = 64;

export const newsSourcePreferencesSchema = z.object({
  sourceIds: z
    .array(z.string().trim().regex(NEWS_SOURCE_ID_PATTERN))
    .max(NEWS_MAX_SELECTED_SOURCES)
    .transform((ids) => [...new Set(ids)]),
  personalEnabled: z.boolean().optional(),
});

export type NewsSourcePreferencesInput = z.infer<typeof newsSourcePreferencesSchema>;

/**
 * A digest of the reader's own, generated after the shared one from the same
 * fetched candidates and restricted to their sources (ADR-0079).
 *
 * It is smaller than the shared digest on purpose: a reader who follows six
 * feeds does not have twelve stories, and padding it with sources they excluded
 * would make the preference a lie. Below the minimum the nightly run publishes
 * nothing and the reader keeps the shared digest.
 */
export const NEWS_PERSONAL_DIGEST_MIN_STORIES = 3;
export const NEWS_PERSONAL_DIGEST_TARGET_STORIES = 8;
export const NEWS_PERSONAL_DIGEST_MAX_STORIES = 12;

/** What one generated personal digest costs (`news.digest.generate`). */
export const NEWS_PERSONAL_DIGEST_COST = 5;

/** How the page is presenting the reader's own digest, when they have one. */
export interface NewsPersonalView {
  /** The reader opted in. */
  enabled: boolean;
  /** A personal digest exists for the day being viewed. */
  available: boolean;
  /** The page is showing it rather than the shared digest. */
  active: boolean;
}

/**
 * The states a reader's source proposal can be in.
 *
 * The reader pastes any link, so the first three states are the system's, not a
 * person's: `resolving` is a row the worker has not answered yet, `ready` is a
 * URL the worker turned into a fetchable feed, and `needs_review` is one it
 * could not (Facebook, X and Instagram have no free public read; a page may
 * simply publish no feed). Only `approved` and `rejected` are an Admin's
 * decision (ADR-0105).
 */
export const NEWS_SOURCE_REQUEST_STATUSES = [
  'resolving',
  'ready',
  'needs_review',
  'approved',
  'rejected',
] as const;
export type NewsSourceRequestStatus = (typeof NEWS_SOURCE_REQUEST_STATUSES)[number];

export const NEWS_SOURCE_REQUEST_STATUS_LABELS: Record<NewsSourceRequestStatus, string> = {
  resolving: 'جاري التحقّق',
  ready: 'جاهز للمراجعة',
  needs_review: 'يحتاج مراجعة',
  approved: 'مقبول',
  rejected: 'مرفوض',
};

/** Where an accepted proposal is written: the reader's own list, or the catalogue. */
export const NEWS_SOURCE_DESTINATIONS = ['private', 'catalogue'] as const;
export type NewsSourceDestination = (typeof NEWS_SOURCE_DESTINATIONS)[number];

/** How a resolved source is read: an XML feed, or a Telegram channel preview. */
export const NEWS_SOURCE_KINDS = ['feed', 'telegram'] as const;
export type NewsSourceKind = (typeof NEWS_SOURCE_KINDS)[number];

/** Why the worker could not turn a URL into a feed. */
export const NEWS_SOURCE_REQUEST_FAILURES = [
  'unsupported',
  'no-feed',
  'unreachable',
  'quota',
] as const;
export type NewsSourceRequestFailure = (typeof NEWS_SOURCE_REQUEST_FAILURES)[number];

/**
 * What the reader and the Admin are told. The reader is not asked to act on
 * most of these — an Admin resolves them — so they say what happened, not what
 * to do.
 */
export const NEWS_SOURCE_REQUEST_FAILURE_LABELS: Record<NewsSourceRequestFailure, string> = {
  unsupported: 'هذه المنصّة لا تسمح بقراءة عامّة، ويحتاج مصدرها إلى إدخال يدويّ.',
  'no-feed': 'لم نجد خلاصة RSS أو Atom على هذه الصفحة.',
  unreachable: 'تعذّر الوصول إلى الرابط.',
  quota: 'وصلت إلى الحدّ الأقصى من المصادر في خطتك الحالية.',
};

/** A request an Admin can still decide, and that counts against the open rule. */
export function isOpenNewsSourceRequest(status: NewsSourceRequestStatus): boolean {
  return status === 'resolving' || status === 'ready' || status === 'needs_review';
}

/**
 * A source a reader proposed. It is an intake record, not a catalogue entry:
 * only an Admin's approval creates the `news_sources` row the fetch reads.
 */
export interface NewsSourceRequest {
  id: string;
  /** The URL as pasted, canonicalised. Never rewritten: it is what was asked for. */
  url: string;
  name: string;
  status: NewsSourceRequestStatus;
  /** What the URL resolved to, once the worker (or an Admin) answered. */
  kind: NewsSourceKind | null;
  /** The fetchable feed, which an Admin approves; null while it is unknown. */
  resolvedUrl: string | null;
  failure: NewsSourceRequestFailure | null;
  /** The machine's one-line reason, for the Admin queue. */
  failureDetail: string | null;
  /** How many worker runs have tried; a stuck row is visible in the queue. */
  attempts: number;
  resolvedAt: string | null;
  category: NewsCategory | null;
  region: NewsRegion | null;
  tier: 1 | 2 | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  sourceId: string | null;
  /** The private source this request created, when it was not sent to the catalogue. */
  userSourceId: string | null;
}

/**
 * A feed one reader added for their own digest (ADR-0106).
 *
 * It is not in the catalogue, no other reader can see it, and only the reader's
 * own personal digest reads it. `broken` is the fetch telling its owner that the
 * feed stopped answering — three consecutive failures — and the remedy is to ask
 * for it again or remove it.
 */
export interface NewsPrivateSource {
  id: string;
  name: string;
  url: string;
  kind: NewsSourceKind;
  category: NewsCategory;
  region: NewsRegion;
  status: NewsPrivateSourceStatus;
  /** Consecutive failed fetches; 0 once the feed answers again. */
  failureCount: number;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export const NEWS_PRIVATE_SOURCE_STATUSES = ['ready', 'broken'] as const;
export type NewsPrivateSourceStatus = (typeof NEWS_PRIVATE_SOURCE_STATUSES)[number];

export const NEWS_PRIVATE_SOURCE_STATUS_LABELS: Record<NewsPrivateSourceStatus, string> = {
  ready: 'يعمل',
  broken: 'توقّف عن العمل',
};

/**
 * How many consecutive failures make a source `broken`. The fetch keeps the row
 * and stops fetching: a feed that is down for a day is usually back, a feed that
 * is down three days in a row is a different address.
 */
export const NEWS_PRIVATE_SOURCE_MAX_FAILURES = 3;

/** What the account page holds, and what the plan allows. */
export interface NewsPrivateSourcesSummary {
  sources: NewsPrivateSource[];
  /** False for a plan with no ceiling (an Admin). */
  limited: boolean;
  cap: number;
  used: number;
  /**
   * Whether the personal digest is on. A private source is only ever read by
   * that digest, so this is what tells the account page to offer the switch
   * rather than leave a reader wondering why nothing arrives (ADR-0106).
   */
  personalEnabled: boolean;
}

/** The one thing the account page may change about a private source's delivery. */
export const newsPersonalDigestToggleSchema = z.object({ personalEnabled: z.literal(true) });

export const NEWS_SOURCE_NAME_MAX = 120;
export const NEWS_SOURCE_URL_MAX = 500;
export const NEWS_SOURCE_NOTE_MAX = 500;

/**
 * The URL a proposal is deduplicated by: fragment and trailing slash dropped,
 * host lowercased. Ports are kept, because `example.com:8080` may genuinely be a
 * different feed from `example.com`.
 */
export function canonicalNewsFeedUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

export const newsSourceRequestSchema = z.object({
  url: z.string().trim().min(1).max(NEWS_SOURCE_URL_MAX),
  name: z.string().trim().min(1).max(NEWS_SOURCE_NAME_MAX),
});

export type NewsSourceRequestInput = z.infer<typeof newsSourceRequestSchema>;

/**
 * What an Admin confirms when accepting a proposal; the request carries no
 * defaults.
 *
 * `feedUrl` is how a `needs_review` row is answered: the worker could not find
 * a feed, so the Admin pastes the one the source really publishes. It is
 * ignored for a `ready` row, whose resolved URL is the decision. `destination`
 * chooses the reader's own list (the default since ADR-0106) or the shared
 * catalogue every reader is offered.
 */
export const newsSourceApprovalSchema = z.object({
  category: z.enum(NEWS_CATEGORIES),
  region: z.enum(NEWS_REGIONS),
  tier: z.union([z.literal(1), z.literal(2)]).default(2),
  note: z.string().trim().max(NEWS_SOURCE_NOTE_MAX).optional(),
  feedUrl: z.string().trim().max(NEWS_SOURCE_URL_MAX).optional(),
  destination: z.enum(['private', 'catalogue']).default('private'),
});

export type NewsSourceApprovalInput = z.infer<typeof newsSourceApprovalSchema>;

export const newsSourceRejectionSchema = z.object({
  note: z.string().trim().max(NEWS_SOURCE_NOTE_MAX).optional(),
});
export type NewsSourceRejectionInput = z.infer<typeof newsSourceRejectionSchema>;

/** The admin list filter: one status, or every decided row when null. */
export const newsSourceRequestListSchema = z.object({
  status: z.enum(NEWS_SOURCE_REQUEST_STATUSES).optional().catch(undefined),
});

export type NewsSourceRequestListQuery = z.infer<typeof newsSourceRequestListSchema>;

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
  /**
   * What the reader's own source selection did to `day`, or null when they have
   * none (or are anonymous). `fellBack` is true when the selection left fewer
   * than `NEWS_PERSONAL_MIN_STORIES` stories, so `day` is the full digest and
   * the page says why instead of showing a nearly empty morning.
   */
  preferences: NewsPreferencesEffect | null;
  /** The reader's own digest for this day, when it exists; null otherwise. */
  personal: NewsPersonalView | null;
  /**
   * Set when the plan caps how many cards the page may show. The page always
   * renders; only the number of story cards is limited (ADR-0093).
   */
  cards: NewsCardsLimit | null;
}

/** The card allowance: how many story cards this reader's plan may show. */
export interface NewsCardsLimit {
  /** Cards a page may show on this reader's plan. */
  cap: number;
  /** Cards the digest, or the search, actually has. */
  total: number;
  /** Cards rendered after the cap. */
  shown: number;
  /** True for a visitor: the remedy is signing in, not upgrading. */
  visitor: boolean;
}

export interface NewsPreferencesEffect {
  /** How many sources the reader kept. */
  selectedSources: number;
  filtered: boolean;
  fellBack: boolean;
}

export const NEWS_SEARCH_LIMIT = 60;

/** How many suggestions the search combobox shows above the "view all" row. */
export const NEWS_SEARCH_SUGGESTION_LIMIT = 8;

/** `YYYY-MM-DD`, the only date form the page accepts in its URL. */
export const NEWS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const NEWS_SEARCH_QUERY_MAX_LENGTH = 80;

/**
 * The combobox's `q`: blank is valid and means "no search" (the route answers
 * empty without touching the database); a real query is 1..80 after trimming.
 */
export const newsSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(
      NEWS_SEARCH_QUERY_MAX_LENGTH,
      `عبارة البحث طويلة جداً: الحدّ الأقصى ${NEWS_SEARCH_QUERY_MAX_LENGTH} حرفًا.`
    ),
});

export type NewsSearchQuery = z.infer<typeof newsSearchQuerySchema>;

/** The retained-month stories matching one term, for the search combobox. */
export interface NewsSearchSuggestions {
  hits: NewsSearchHit[];
}

export const newsQuerySchema = z.object({
  q: z.string().trim().max(NEWS_SEARCH_QUERY_MAX_LENGTH).optional().catch(undefined),
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
