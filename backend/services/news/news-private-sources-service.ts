import type { NewsSourceRequestsRepository } from '@/backend/repositories/news/news-source-requests-repository';
import type { NewsUserSourcesRepository } from '@/backend/repositories/news/news-user-sources-repository';
import { AppError } from '@/backend/shared/errors';
import {
  isOpenNewsSourceRequest,
  type NewsOwnedSource,
  type NewsOwnedSourceState,
  type NewsOwnedSourcesSummary,
  type NewsPrivateSource,
  type NewsSourceRequest,
  type NewsSourceRequestStatus,
} from '@/shared/contracts/news';

/**
 * A reader's own sources (ADR-0106, ADR-0130): what their personal digest reads,
 * what they asked for and have not been given yet, and the plan's ceiling.
 *
 * One list, because a reader has one relationship with these links. A request
 * that the worker accepted is a feed (`news_user_sources`); everything else is
 * the request itself, still being read or refused. Reading both here keeps a
 * link from vanishing from the page between the two tables.
 *
 * There is no create path here on purpose. A private source is created by
 * accepting a resolved request (the resolver's RPC, or an Admin's answer), so a
 * reader can never hand the fetch an address it has not read first. The digest
 * that reads the list is on for every account (ADR-0131), so there is no switch
 * here either: a source that is ready is delivered.
 */
export class NewsPrivateSourceNotFoundError extends AppError {
  constructor() {
    super('هذا المصدر غير موجود.', 404, 'source_not_found');
  }
}

export class NewsPrivateSourcesLimitError extends AppError {
  constructor(readonly cap: number | null = null) {
    super(
      cap === null
        ? 'وصلت إلى الحدّ الأقصى من المصادر الخاصّة في خطتك الحالية.'
        : `يمكنك حفظ ${cap} مصادر خاصّة كحدّ أقصى في خطتك الحالية.`,
      402,
      'usage_limit'
    );
  }
}

/** How many rows that are not feeds yet the page shows; the list is a convenience, not an archive. */
const PENDING_ROWS_LIMIT = 20;

export interface NewsPrivateSourcesService {
  list(userId: string): Promise<NewsOwnedSourcesSummary>;
  remove(userId: string, id: string): Promise<void>;
}

interface Deps {
  sources: NewsUserSourcesRepository;
  requests: Pick<NewsSourceRequestsRepository, 'listOwnedPending'>;
  /** The plan's ceiling, resolved from `plan_quotas` like every other quota. */
  quota: (userId: string) => Promise<{ cap: number; unlimited: boolean }>;
}

/** The badge a feed carries: its health, never the approval that created it. */
function sourceState(source: NewsPrivateSource): NewsOwnedSourceState {
  return source.status === 'broken' ? 'broken' : 'live';
}

function ownSourceRow(source: NewsPrivateSource): NewsOwnedSource {
  return {
    id: source.id,
    kind: 'source',
    name: source.name,
    url: source.url,
    resolvedUrl: null,
    state: sourceState(source),
    failure: null,
    note: null,
    lastError: source.lastError,
    createdAt: source.createdAt,
  };
}

/**
 * A request's own state. `approved` cannot reach a row here — the query excludes
 * the rows that became feeds — and is mapped to the feed state a later reader
 * would see, so a contract that widens cannot leave the row unlabelled.
 */
const REQUEST_STATES: Record<NewsSourceRequestStatus, NewsOwnedSourceState> = {
  resolving: 'resolving',
  ready: 'ready',
  needs_review: 'needs_review',
  rejected: 'rejected',
  approved: 'live',
};

function requestRow(request: NewsSourceRequest): NewsOwnedSource {
  return {
    id: request.id,
    kind: 'request',
    name: request.name,
    url: request.url,
    resolvedUrl: request.resolvedUrl,
    state: REQUEST_STATES[request.status],
    failure: request.failure,
    note: request.note,
    lastError: null,
    createdAt: request.createdAt,
  };
}

export function createNewsPrivateSourcesService({
  sources,
  requests,
  quota,
}: Deps): NewsPrivateSourcesService {
  async function summary(userId: string): Promise<NewsOwnedSourcesSummary> {
    const [rows, pending, allowance] = await Promise.all([
      sources.list(userId),
      requests.listOwnedPending(userId, PENDING_ROWS_LIMIT),
      quota(userId),
    ]);

    return {
      rows: [...pending.map(requestRow), ...rows.map(ownSourceRow)].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ),
      limited: !allowance.unlimited,
      cap: allowance.cap,
      // A row still being read is a source the reader asked for, and submission
      // counts it against the ceiling; the badge must count it too, or the page
      // says there is room the next submit refuses (ADR-0106's rule).
      used: rows.length + pending.filter((row) => isOpenNewsSourceRequest(row.status)).length,
    };
  }

  return {
    list: summary,

    async remove(userId: string, id: string): Promise<void> {
      const removed = await sources.remove(userId, id);
      if (!removed) throw new NewsPrivateSourceNotFoundError();
    },
  };
}
