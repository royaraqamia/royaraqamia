import { AppError } from '@/backend/shared/errors';
import type { NewsSourceRequestsRepository } from '@/backend/repositories/news/news-source-requests-repository';
import type { NewsSourcesRepository } from '@/backend/repositories/news/news-sources-repository';
import { FeedProbeError, type FeedProbeResult } from '@/backend/services/news/feed-probe';
import type { NewsCatalogue } from '@/backend/services/news/news-catalogue';
import {
  canonicalNewsFeedUrl,
  type NewsSourceApprovalInput,
  type NewsSourceRequest,
  type NewsSourceRequestInput,
  type NewsSourceRequestStatus,
  type NewsSourceRejectionInput,
} from '@/shared/contracts/news';

/**
 * A reader proposing a feed, and an Admin deciding on it (ADR-0078).
 *
 * Every refusal here is a 409/422 with a sentence the form can show as-is: the
 * submitter is a reader, not an operator, and "the URL did not look like a feed"
 * is the useful answer.
 */
export class FeedUnavailableError extends AppError {
  constructor(readonly failure: 'unreachable' | 'not-a-feed') {
    super(
      failure === 'unreachable'
        ? 'تعذّر الوصول إلى هذا الرابط. تأكَّد من أنَّه يعمل ثم أعد المحاولة.'
        : 'هذا الرابط لا يعرض خلاصة RSS أو Atom، أو لا يحتوي أخبارًا.',
      422,
      failure === 'unreachable' ? 'feed_unreachable' : 'feed_not_a_feed'
    );
  }
}

export class NewsSourceAlreadyKnownError extends AppError {
  constructor() {
    super('هذا المصدر موجود في القائمة بالفعل.', 409, 'source_known');
  }
}

export class NewsSourceAlreadyQueuedError extends AppError {
  constructor() {
    super('هناك طلب قيد المراجعة لهذا المصدر.', 409, 'source_queued');
  }
}

export class NewsSourceRequestPendingError extends AppError {
  constructor() {
    super('لديك طلب قيد المراجعة. انتظر قراره قبل إرسال طلب جديد.', 409, 'request_pending');
  }
}

export class NewsSourceRequestNotFoundError extends AppError {
  constructor() {
    super('الطلب غير موجود.', 404, 'request_not_found');
  }
}

export class NewsSourceRequestDecidedError extends AppError {
  constructor() {
    super('تمَّ البتُّ في هذا الطلب من قبل.', 409, 'request_decided');
  }
}

const USER_REQUESTS_LIMIT = 20;
const ADMIN_REQUESTS_LIMIT = 100;

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
  catalogue: NewsCatalogue;
  probe: (url: string) => Promise<FeedProbeResult>;
}

/** Submission needs no catalogue: a proposal is deduplicated by URL, not by id. */
type SubmitDeps = Omit<RequestsDeps, 'catalogue'>;

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
  probe,
}: SubmitDeps): NewsSourceRequestsService {
  return {
    async submit(userId: string, input: NewsSourceRequestInput): Promise<NewsSourceRequest> {
      const url = canonicalNewsFeedUrl(input.url);
      if (!url) throw new FeedUnavailableError('not-a-feed');

      if (await sources.findIdByUrl(url)) throw new NewsSourceAlreadyKnownError();
      if (await requests.findPendingIdByUrl(url)) throw new NewsSourceAlreadyQueuedError();
      if ((await requests.countPending(userId)) > 0) throw new NewsSourceRequestPendingError();

      try {
        await probe(url);
      } catch (error) {
        if (error instanceof FeedProbeError) throw new FeedUnavailableError(error.failure);
        throw error;
      }

      return requests.insert({ userId, url, name: input.name.trim() });
    },

    listMine(userId: string): Promise<NewsSourceRequest[]> {
      return requests.listForUser(userId, USER_REQUESTS_LIMIT);
    },
  };
}

export function createNewsAdminService({
  requests,
  sources,
  catalogue,
}: Omit<RequestsDeps, 'probe'>): NewsSourceAdminService {
  async function pendingOrThrow(id: string): Promise<NewsSourceRequest> {
    const request = await requests.findById(id);
    if (!request) throw new NewsSourceRequestNotFoundError();
    if (request.status !== 'pending') throw new NewsSourceRequestDecidedError();
    return request;
  }

  return {
    list(status: NewsSourceRequestStatus | null): Promise<NewsSourceRequest[]> {
      return requests.listForAdmin(status, ADMIN_REQUESTS_LIMIT);
    },

    async approve(
      id: string,
      input: NewsSourceApprovalInput,
      reviewedBy: string
    ): Promise<NewsSourceRequest> {
      const request = await pendingOrThrow(id);

      const taken = new Set((await catalogue.list()).map((source) => source.id));
      const base = slugForHost(new URL(request.url).hostname) || 'source';

      let sourceId = base;
      for (let suffix = 2; taken.has(sourceId); suffix += 1) {
        sourceId = `${base}-${suffix}`;
        if (suffix > 99)
          throw new AppError('تعذّر توليد معرِّف للمصدر.', 500, 'source_id_exhausted');
      }

      await sources.insert({
        id: sourceId,
        name: request.name,
        url: request.url,
        category: input.category,
        region: input.region,
        tier: input.tier,
        approvedBy: reviewedBy,
        requestId: request.id,
      });

      await requests.markApproved({
        id: request.id,
        sourceId,
        category: input.category,
        region: input.region,
        tier: input.tier,
        note: input.note ?? null,
        reviewedBy,
      });

      return (await requests.findById(request.id)) ?? { ...request, status: 'approved', sourceId };
    },

    async reject(
      id: string,
      input: NewsSourceRejectionInput,
      reviewedBy: string
    ): Promise<NewsSourceRequest> {
      const request = await pendingOrThrow(id);

      await requests.markRejected({ id: request.id, note: input.note ?? null, reviewedBy });
      return (await requests.findById(request.id)) ?? { ...request, status: 'rejected' };
    },
  };
}
