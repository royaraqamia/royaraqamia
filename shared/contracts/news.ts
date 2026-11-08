import { z } from 'zod';

import { damascusDateKey } from '@/shared/time';
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

/**
 * How long a digest survives; the sweeps in `20261023130200` and
 * `20261024160000` enforce it, and the seven-day form of both is in
 * `20261104120000` (ADR-0076's 2026-11-04 amendment). The owner's decision: a
 * digest older than a week is history nobody reads, and keeping third-party
 * summaries past the point they serve is a liability rather than an archive.
 * Search covers the same window by construction, because the rows stop existing.
 */
export const NEWS_RETENTION_DAYS = 7;

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

/**
 * The ids a signed-in reader kept; empty means "every source".
 *
 * A reader's own digest is not an opt-in any more: it is generated for every
 * account that has something of its own to narrow or to add (ADR-0131), so the
 * only preference left here is the selection itself.
 */
export interface NewsSourcePreferences {
  sourceIds: string[];
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
  /** A personal digest exists for the day being viewed. */
  available: boolean;
  /** The page is showing it rather than the shared digest. */
  active: boolean;
  /**
   * The feeds only this reader holds (`news_user_sources`), and how many of them
   * a story reached the digest on screen (ADR-0106). Null when they hold none.
   *
   * It is the page's only way to say "your own sources produced nothing" instead
   * of leaving a reader to assume a source is broken when the day simply had no
   * story from it.
   */
  ownSources: NewsOwnSources | null;
}

export interface NewsOwnSources {
  total: number;
  contributed: number;
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

/**
 * The states the reader's own list draws.
 *
 * The first four are a request's own states, and the last two are the health of
 * the feed a request became. There is one badge per row: a link that turned into
 * a source stops being "approved" and becomes "يعمل" or "توقّف عن العمل", so the
 * page never shows two answers for one row.
 */
export const NEWS_OWNED_SOURCE_STATES = [
  'resolving',
  'ready',
  'needs_review',
  'rejected',
  'live',
  'broken',
] as const;
export type NewsOwnedSourceState = (typeof NEWS_OWNED_SOURCE_STATES)[number];

/**
 * One row of the reader's own list: a feed they hold, or a link still on its way
 * to becoming one (ADR-0106, ADR-0130).
 *
 * `kind` is what the delete acts on — a source is removed from the reader's own
 * feeds, an open request is cancelled — and it is the server's answer, so the
 * client never guesses which table a row lives in.
 */
export interface NewsOwnedSource {
  /** The source's id for a feed, the request's id for anything still in flight. */
  id: string;
  kind: 'source' | 'request';
  name: string;
  /** The link the reader pasted, or the feed actually fetched for a source. */
  url: string;
  /** The feed a request resolved to, when it is different from `url`. */
  resolvedUrl: string | null;
  state: NewsOwnedSourceState;
  /** Why the system could not turn the link into a feed; request rows only. */
  failure: NewsSourceRequestFailure | null;
  /** An Admin's sentence about a refused row; request rows only. */
  note: string | null;
  /** The fetch's last complaint about a feed; source rows only. */
  lastError: string | null;
  createdAt: string;
}

/** What the account page holds: the one list, and what the plan allows. */
export interface NewsOwnedSourcesSummary {
  rows: NewsOwnedSource[];
  /** False for a plan with no ceiling (an Admin). */
  limited: boolean;
  cap: number;
  used: number;
}

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

/**
 * A proposal carries the link and nothing else: the name a reader used to type is
 * derived from the source itself (the feed's own title, or its host until the
 * resolver has read one), so the form asks for the one thing only the reader
 * knows.
 */
export const newsSourceRequestSchema = z.object({
  url: z.string().trim().min(1).max(NEWS_SOURCE_URL_MAX),
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

/**
 * The board as the app decodes it (#926).
 *
 * The page reads `GET /api/news/board` directly, and the app reads the same
 * route, so the JSON the route answers is generated into Kotlin by
 * `contracts:generate`. Only the read is a schema: the digest is written by the
 * workflow with the service role, never by either client, so there is no write
 * shape to share. The schemas mirror the interfaces above rather than replacing
 * them, because the page consumes those types through its own loader and the
 * generated Kotlin is the app's only consumer of the JSON form.
 */
const newsStorySchema = z.object({
  id: z.string(),
  position: z.number().int(),
  category: z.enum(NEWS_CATEGORIES),
  region: z.enum(NEWS_REGIONS),
  headline: z.string(),
  summary: z.string(),
  whyItMatters: z.string().nullable(),
  sourceId: z.string(),
  sourceName: z.string(),
  sourceUrl: z.string(),
  sourcePublishedAt: z.string().nullable(),
});

const newsSearchHitSchema = newsStorySchema.extend({
  digestDate: z.string(),
});

const newsDigestSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  lede: z.string(),
  storyCount: z.number().int(),
  model: z.string(),
  publishedAt: z.string(),
});

export const newsBoardResponseSchema = z.object({
  board: z.object({
    day: z
      .object({
        digest: newsDigestSchema,
        stories: z.array(newsStorySchema),
      })
      .nullable(),
    dates: z.array(z.string()),
    search: z
      .object({
        query: z.string(),
        category: z.enum(NEWS_CATEGORIES).nullable(),
        hits: z.array(newsSearchHitSchema),
        truncated: z.boolean(),
      })
      .nullable(),
    hasAnyDigest: z.boolean(),
    preferences: z
      .object({
        selectedSources: z.number().int(),
        filtered: z.boolean(),
        fellBack: z.boolean(),
      })
      .nullable(),
    personal: z
      .object({
        available: z.boolean(),
        active: z.boolean(),
        ownSources: z
          .object({
            total: z.number().int(),
            contributed: z.number().int(),
          })
          .nullable(),
      })
      .nullable(),
    cards: z
      .object({
        cap: z.number().int(),
        total: z.number().int(),
        shown: z.number().int(),
        visitor: z.boolean(),
      })
      .nullable(),
  }),
});

export type NewsBoardResponse = z.infer<typeof newsBoardResponseSchema>;

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

/**
 * One row the search combobox paints, and nothing more.
 *
 * The suggestion read answers anonymous callers, so it carries only the fields
 * the row renders. A story's body and its source link stay behind the board's
 * search, where the plan's Card allowance applies (ADR-0093); `NewsSearchHit`
 * remains the board's shape.
 */
export interface NewsSearchSuggestion {
  id: string;
  headline: string;
  category: NewsCategory;
  sourceName: string;
  digestDate: string;
}

/** The retained-month stories matching one term, for the search combobox. */
export interface NewsSearchSuggestions {
  hits: NewsSearchSuggestion[];
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
  return damascusDateKey(now);
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

/**
 * The bodies `/account/news` reads and writes, shaped for the app's decoder.
 *
 * The page's three islands consume these routes on the web already; the app
 * draws the same three and therefore decodes the same envelopes rather than
 * inventing narrower ones (ADR-0098). The refusal fields travel with every
 * envelope because a sentence from the server is a state the screen draws, not
 * an exception it throws (ADR-0031).
 */
export const newsSourcesResponseSchema = z.object({
  success: z.boolean(),
  sources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.enum(NEWS_CATEGORIES),
      region: z.enum(NEWS_REGIONS),
      tier: z.number().int(),
    })
  ),
  selected: z.array(z.string()),
  error: z.string().optional(),
  code: z.string().optional(),
});

/** The selection write answers what the server actually kept, not the request. */
export const newsSourceSelectionResponseSchema = z.object({
  success: z.boolean(),
  selected: z.array(z.string()),
  error: z.string().optional(),
  code: z.string().optional(),
});

/**
 * The reader's one list: the feeds they hold and the links still on their way,
 * in one envelope (ADR-0130). The row is the source of truth for what a delete
 * would act on, so the two tables never leak into the client's shape.
 */
export const newsPrivateSourcesResponseSchema = z.object({
  success: z.boolean(),
  rows: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['source', 'request']),
      name: z.string(),
      url: z.string(),
      resolvedUrl: z.string().nullable(),
      state: z.enum(NEWS_OWNED_SOURCE_STATES),
      failure: z.enum(NEWS_SOURCE_REQUEST_FAILURES).nullable(),
      note: z.string().nullable(),
      lastError: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
  limited: z.boolean(),
  cap: z.number().int(),
  used: z.number().int(),
  error: z.string().optional(),
  code: z.string().optional(),
});

/** The one row a submit answers, in the same shape the list carries. */
export const newsSourceRequestResponseSchema = z.object({
  success: z.boolean(),
  request: z
    .object({
      id: z.string(),
      url: z.string(),
      name: z.string(),
      status: z.enum(NEWS_SOURCE_REQUEST_STATUSES),
      kind: z.enum(NEWS_SOURCE_KINDS).nullable(),
      resolvedUrl: z.string().nullable(),
      failure: z.enum(NEWS_SOURCE_REQUEST_FAILURES).nullable(),
      failureDetail: z.string().nullable(),
      attempts: z.number().int(),
      resolvedAt: z.string().nullable(),
      category: z.enum(NEWS_CATEGORIES).nullable(),
      region: z.enum(NEWS_REGIONS).nullable(),
      tier: z.number().int().nullable(),
      note: z.string().nullable(),
      createdAt: z.string(),
      reviewedAt: z.string().nullable(),
      sourceId: z.string().nullable(),
      userSourceId: z.string().nullable(),
    })
    .optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});

/** A write whose only answer is “it landed”, or the sentence it was refused with. */
export const newsOkResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  code: z.string().optional(),
});
