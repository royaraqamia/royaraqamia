import { AppError } from '@/backend/shared/errors';
import {
  NewsSourceRequestDbError,
  OPEN_REQUEST_URL_CONSTRAINT,
  OPEN_REQUEST_USER_CONSTRAINT,
  type NewsSourceRequestsRepository,
} from '@/backend/repositories/news/news-source-requests-repository';
import type { NewsSourcesRepository } from '@/backend/repositories/news/news-sources-repository';
import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import { FeedProbeError, type FeedProbeResult } from '@/backend/services/news/feed-probe';
import { hasFileSourceUrl, type NewsCatalogue } from '@/backend/services/news/news-catalogue';
import { NewsPrivateSourcesLimitError } from '@/backend/services/news/news-private-sources-service';
import { isPublicHttpUrl } from '@/shared/network';
import {
  canonicalNewsFeedUrl,
  type NewsSourceApprovalInput,
  type NewsSourceRequest,
  type NewsSourceRequestInput,
  type NewsSourceRequestStatus,
  type NewsSourceRejectionInput,
} from '@/shared/contracts/news';

/**
 * A reader proposing a source, and an Admin deciding on it (ADR-0078, ADR-0105,
 * ADR-0106).
 *
 * Submission no longer reads the URL — the resolver does, afterwards — and it no
 * longer asks an Admin for permission: a resolved link becomes a private source
 * for the reader who asked. What is left here is the record: the plan's ceiling,
 * the reader's own duplicates, and the catalogue's.
 */
export class NewsSourceUrlInvalidError extends AppError {
  constructor() {
    super('أدخل رابطًا يبدأ بـ https://', 422, 'invalid_url');
  }
}

export class NewsSourceAlreadyKnownError extends AppError {
  constructor() {
    super(
      'هذا المصدر موجود في قائمة المصادر بالفعل، ويمكنك اختياره من القائمة.',
      409,
      'source_known'
    );
  }
}

export class NewsSourceAlreadyQueuedError extends AppError {
  constructor() {
    super('هذا الرابط مُرسَل مسبقًا ولم ينتهِ تحقّقه بعد.', 409, 'source_queued');
  }
}

export class NewsSourceAlreadyHeldError extends AppError {
  constructor() {
    super('هذا المصدر موجود في مصادرك الخاصّة بالفعل.', 409, 'source_held');
  }
}

export class NewsSourceRequestNotFoundError extends AppError {
  constructor() {
    super('الطلب غير موجود.', 404, 'request_not_found');
  }
}

export class NewsSourceRequestDecidedError extends AppError {
  constructor() {
    super('تم اتخاذ القرار لهذا الطلب من قبل.', 409, 'request_decided');
  }
}

export class NewsSourceRequestResolvingError extends AppError {
  constructor() {
    super(
      'لم ينتهِ تحقّق النظام من هذا الرابط بعد. أعد المحاولة بعد قليل.',
      409,
      'request_resolving'
    );
  }
}

/** The Admin is answering a `needs_review` row, and a decision needs a feed. */
export class NewsSourceFeedRequiredError extends AppError {
  constructor() {
    super('الصق رابط خلاصة RSS أو Atom للمصدر قبل قبوله.', 422, 'feed_required');
  }
}

/** The URL an Admin pasted does not answer with a feed; the probe's own sentence. */
export class FeedUnavailableError extends AppError {
  constructor(readonly failure: 'unreachable' | 'not-a-feed') {
    super(
      failure === 'unreachable'
        ? 'تعذّر الوصول إلى الرابط. تحقّق من صحّته ثم أعد المحاولة.'
        : 'هذا الرابط ليس خلاصة RSS أو Atom، ولا يحتوي عناصر.',
      422,
      failure === 'unreachable' ? 'feed_unreachable' : 'feed_not_a_feed'
    );
  }
}

const USER_REQUESTS_LIMIT = 20;
const ADMIN_REQUESTS_LIMIT = 100;

/** The id suffixes one approval may try before giving up (the loop this replaces). */
const MAX_SOURCE_ID_ATTEMPTS = 99;

/**
 * SQLSTATEs the approval RPCs raise (#572). Both writes happen in one
 * transaction, so the service can translate a refusal into the Admin's 409/404
 * without having written a source first.
 */
const SOURCE_ID_TAKEN = 'NS001';
const REQUEST_DECIDED = 'NS002';
const SOURCE_URL_TAKEN = 'NS003';
const FEED_MISSING = 'NS004';
const REQUEST_MISSING = 'P0002';
/** The plan's private-source ceiling, raised by the trigger (ADR-0106). */
const QUOTA_REACHED = 'PL001';

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : null;
}

/**
 * The refusals the partial unique index raises (#551), which the pre-checks
 * cannot see: two submits from one account can race past the counts. Anything
 * else — a broken connection, a permissions change — stays a failure.
 */
function submissionError(error: unknown): never {
  if (error instanceof NewsSourceRequestDbError) {
    // Both indexes now say the same thing: this reader already has an open
    // request for this URL.
    if (error.constraint === OPEN_REQUEST_URL_CONSTRAINT) throw new NewsSourceAlreadyQueuedError();
    if (error.constraint === OPEN_REQUEST_USER_CONSTRAINT) {
      throw new NewsSourceAlreadyQueuedError();
    }
  }
  throw error;
}

export interface NewsSourceRequestsService {
  submit(userId: string, input: NewsSourceRequestInput): Promise<NewsSourceRequest>;
  listMine(userId: string): Promise<NewsSourceRequest[]>;
}

export interface NewsSourceAdminService {
  list(status: NewsSourceRequestStatus | null): Promise<NewsSourceRequest[]>;
  approve(
    id: string,
    input: NewsSourceApprovalInput,
    reviewedBy: string
  ): Promise<NewsSourceRequest>;
  reject(
    id: string,
    input: NewsSourceRejectionInput,
    reviewedBy: string
  ): Promise<NewsSourceRequest>;
}

interface RequestsDeps {
  requests: NewsSourceRequestsRepository;
  sources: NewsSourcesRepository;
  /** The reader's own list, for the plan's ceiling and the duplicate check. */
  privateSources: NewsUserSourcesRepository;
  catalogue: NewsCatalogue;
  /** The plan's private-source allowance, resolved from `plan_quotas`. */
  quota: (userId: string) => Promise<{ cap: number; unlimited: boolean }>;
  /** Only an Admin's pasted URL is probed synchronously. */
  probe: (url: string) => Promise<FeedProbeResult>;
}

/** Submission needs no catalogue read: a proposal is deduplicated by URL. */
type SubmitDeps = Pick<RequestsDeps, 'requests' | 'sources' | 'privateSources' | 'quota'>;

/** A decision needs no source read: the approval RPC owns both writes. */
type ApprovalDeps = Pick<RequestsDeps, 'requests' | 'catalogue' | 'probe'>;

/** A host-derived slug: `example.com` → `example-com`, the id a story publishes under. */
function slugForHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function createNewsSourceRequestsService({
  requests,
  sources,
  privateSources,
  quota,
}: SubmitDeps): NewsSourceRequestsService {
  return {
    /**
     * Files the URL and returns. Nothing here fetches the target: a link that is
     * slow, blocked or not a feed is the resolver's problem, and the reader is
     * told what happened on their next visit rather than in a failed submit.
     */
    async submit(userId: string, input: NewsSourceRequestInput): Promise<NewsSourceRequest> {
      const url = canonicalNewsFeedUrl(input.url);
      if (!url) throw new NewsSourceUrlInvalidError();

      // The file list and the catalogue are what every reader already has, so a
      // private copy would only fetch the same feed twice.
      if (hasFileSourceUrl(url)) throw new NewsSourceAlreadyKnownError();
      if (await sources.findIdByUrl(url)) throw new NewsSourceAlreadyKnownError();

      if (await privateSources.findIdByUrl(userId, url)) throw new NewsSourceAlreadyHeldError();
      if (await requests.findOpenIdByUrl(userId, url)) throw new NewsSourceAlreadyQueuedError();

      // The plan counts what the reader holds *and* what is still resolving: a
      // row in flight is a source they asked for.
      const allowance = await quota(userId);
      if (!allowance.unlimited) {
        const [held, open] = await Promise.all([
          privateSources.count(userId),
          requests.countOpen(userId),
        ]);
        if (held + open >= allowance.cap) throw new NewsPrivateSourcesLimitError(allowance.cap);
      }

      try {
        return await requests.insert({ userId, url, name: input.name.trim() });
      } catch (error) {
        submissionError(error);
      }
    },

    listMine(userId: string): Promise<NewsSourceRequest[]> {
      return requests.listForUser(userId, USER_REQUESTS_LIMIT);
    },
  };
}

export function createNewsAdminService({
  requests,
  catalogue,
  probe,
}: ApprovalDeps): NewsSourceAdminService {
  /**
   * A row is decidable once the resolver has answered it. `resolving` is not a
   * refusal of the reader's link — it is "not yet", and the queue says so.
   */
  async function decidableOrThrow(id: string): Promise<NewsSourceRequest> {
    const request = await requests.findById(id);
    if (!request) throw new NewsSourceRequestNotFoundError();
    if (request.status === 'resolving') throw new NewsSourceRequestResolvingError();
    if (request.status !== 'ready' && request.status !== 'needs_review') {
      throw new NewsSourceRequestDecidedError();
    }
    return request;
  }

  /** The refusals the RPCs raise that the Admin's form has a sentence for. */
  function approvalError(error: unknown): never {
    switch (errorCode(error)) {
      case SOURCE_URL_TAKEN:
        throw new NewsSourceAlreadyKnownError();
      case REQUEST_DECIDED:
        throw new NewsSourceRequestDecidedError();
      case FEED_MISSING:
        throw new NewsSourceFeedRequiredError();
      case QUOTA_REACHED:
        throw new NewsPrivateSourcesLimitError();
      case REQUEST_MISSING:
        throw new NewsSourceRequestNotFoundError();
      default:
        throw error;
    }
  }

  return {
    list(status: NewsSourceRequestStatus | null): Promise<NewsSourceRequest[]> {
      return requests.listForAdmin(status, ADMIN_REQUESTS_LIMIT);
    },

    /**
     * One call to `public.approve_news_source_request`: the source and the
     * request's decision commit together, so a failure leaves the request open
     * and the retry safe (#572).
     *
     * The destination is the Admin's: the reader's own list (the default since
     * ADR-0106) or the catalogue every reader is offered. A catalogue row needs a
     * slug and can collide on its URL, so only that branch loops.
     */
    async approve(
      id: string,
      input: NewsSourceApprovalInput,
      reviewedBy: string
    ): Promise<NewsSourceRequest> {
      const request = await decidableOrThrow(id);

      const pasted = input.feedUrl ? canonicalNewsFeedUrl(input.feedUrl) : null;
      if (input.feedUrl && (!pasted || !isPublicHttpUrl(pasted))) {
        throw new NewsSourceUrlInvalidError();
      }

      const feedUrl = pasted ?? request.resolvedUrl;
      if (!feedUrl) throw new NewsSourceFeedRequiredError();

      // A pasted URL is the Admin's own claim; the probe is what makes it a feed
      // rather than a page that will quietly fetch nothing tomorrow. It runs
      // only for a paste: a `ready` row was probed by the resolver already.
      if (pasted) {
        try {
          await probe(pasted);
        } catch (error) {
          if (error instanceof FeedProbeError) throw new FeedUnavailableError(error.failure);
          throw error;
        }
      }

      // The feed may have reached the file after it was proposed, and the file
      // wins the merge — approving would write a row the fetch then drops (#551).
      if (hasFileSourceUrl(feedUrl)) throw new NewsSourceAlreadyKnownError();

      const kind = pasted ? 'feed' : (request.kind ?? 'feed');
      const base = slugForHost(new URL(feedUrl).hostname) || 'source';
      const attempts = input.destination === 'catalogue' ? MAX_SOURCE_ID_ATTEMPTS : 1;
      const taken =
        input.destination === 'catalogue'
          ? new Set((await catalogue.list()).map((source) => source.id))
          : new Set<string>();

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const sourceId = attempt === 1 ? base : `${base}-${attempt}`;
        if (taken.has(sourceId)) continue;

        try {
          return await requests.approve({
            id: request.id,
            sourceId,
            sourceName: request.name,
            sourceUrl: feedUrl,
            kind,
            category: input.category,
            region: input.region,
            tier: input.tier,
            note: input.note ?? null,
            reviewedBy,
            destination: input.destination,
          });
        } catch (error) {
          if (errorCode(error) !== SOURCE_ID_TAKEN) approvalError(error);
        }
      }

      throw new AppError('تعذّر توليد معرِّف للمصدر.', 500, 'source_id_exhausted');
    },

    async reject(
      id: string,
      input: NewsSourceRejectionInput,
      reviewedBy: string
    ): Promise<NewsSourceRequest> {
      const request = await decidableOrThrow(id);

      await requests.markRejected({ id: request.id, note: input.note ?? null, reviewedBy });
      return (await requests.findById(request.id)) ?? { ...request, status: 'rejected' };
    },
  };
}
