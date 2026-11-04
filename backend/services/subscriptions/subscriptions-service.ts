import { randomInt } from 'crypto';
import type {
  SubscriptionRequestCreateInput,
  SubscriptionRequestListQuery,
  SubscriptionRequestUpdate,
  SubscriptionRequestsRepository,
} from '@/backend/repositories/subscriptions/subscriptions-repository';
import {
  SUBSCRIPTION_PLAN,
  SUBSCRIPTION_REFERENCE_CODE_PREFIX,
  type SubscriptionRequest,
  type SubscriptionRequestInput,
  type SubscriptionRequestUpdateInput,
} from '@/shared/contracts/subscriptions';
import { toNullableText } from '@/shared/contracts/text';
import type { Paginated } from '@/shared/pagination';
import { mintReferenceCode, mintWithUniqueCode } from '@/shared/reference-code';

// A per-account backstop, deliberately fail-open: a lead form must keep
// accepting leads if the limiter's store is unreachable. The window is
// generous because a reader who mistypes a phone number submits twice.
const SUBMIT_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

// Admin edits push a notification each time, so one screen cannot spam.
const EDIT_LIMIT = 20;
const EDIT_WINDOW_MS = 10 * 60_000;

const MAX_REFERENCE_CODE_ATTEMPTS = 3;

export class SubscriptionRequestRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من المحاولات. الرجاء المحاولة بعد قليل.');
    this.name = 'SubscriptionRequestRateLimitError';
  }
}

export class SubscriptionRequestNotFoundError extends Error {
  constructor() {
    super('طلب الاشتراك غير موجود.');
    this.name = 'SubscriptionRequestNotFoundError';
  }
}

export function generateSubscriptionReferenceCode(): string {
  return mintReferenceCode(SUBSCRIPTION_REFERENCE_CODE_PREFIX, (maxExclusive) =>
    randomInt(maxExclusive)
  );
}

/** Distinguishes a fresh request from a later Admin edit of the same row. */
export type SubscriptionRequestNotificationEvent = 'created' | 'updated';

export interface SubscriptionRequestNotifier {
  (request: SubscriptionRequest, event: SubscriptionRequestNotificationEvent): void;
}

export interface SubscriptionRequestServiceDeps {
  repository: SubscriptionRequestsRepository;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  generateReferenceCode: () => string;
  /** Fail-safe: called after the row is committed, never allowed to throw upstream. */
  notifyAdmins?: SubscriptionRequestNotifier;
  captureException?: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
}

export interface SubmitSubscriptionRequestContext {
  /** Required: a plan is activated on an account, so a request without one is unusable. */
  userId: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/**
 * The «اشترِك الآن» form's write path.
 *
 * A submission is idempotent on the Outbox's `client_id` (ADR-0029, ticket
 * #169): a queued submit replayed after reconnection returns the row it already
 * created instead of writing a second one. The plan is the page's constant and
 * the price lives in `plan_settings`, so neither is accepted from the reader.
 */
export class SubscriptionRequestService {
  constructor(private readonly deps: SubscriptionRequestServiceDeps) {}

  async submit(
    input: SubscriptionRequestInput,
    context: SubmitSubscriptionRequestContext
  ): Promise<SubscriptionRequest> {
    const clientId = input.client_id ?? null;
    if (clientId) {
      const existing = await this.deps.repository.getByClientId(clientId);
      if (existing) return existing;
    }

    const allowed = await this.deps.checkRateLimit(
      `subscription:${context.userId}`,
      SUBMIT_LIMIT,
      WINDOW_MS
    );
    if (!allowed) throw new SubscriptionRequestRateLimitError();

    const { result: request } = await mintWithUniqueCode({
      attempts: MAX_REFERENCE_CODE_ATTEMPTS,
      mint: () => this.deps.generateReferenceCode(),
      attempt: (referenceCode) =>
        this.deps.repository.create({
          user_id: context.userId,
          plan: SUBSCRIPTION_PLAN,
          full_name: input.full_name,
          phone_whatsapp: input.phone_whatsapp,
          email: toNullableText(input.email),
          note: toNullableText(input.note),
          reference_code: referenceCode,
          client_id: clientId,
        } satisfies SubscriptionRequestCreateInput),
      isCollision: isUniqueViolation,
      onExhausted: () => new Error('تعذّر توليد رقم طلب فريد. الرجاء المحاولة مرة أخرى.'),
    });

    try {
      this.deps.notifyAdmins?.(request, 'created');
    } catch (error) {
      // The row is already committed — a notify failure must not surface to the
      // reader as a failed submission.
      this.deps.captureException?.(error, {
        extra: { source: 'subscription.submit.notify', id: request.id },
      });
    }

    return request;
  }

  async list(query: SubscriptionRequestListQuery): Promise<Paginated<SubscriptionRequest>> {
    return this.deps.repository.list(query);
  }

  async listMine(userId: string): Promise<SubscriptionRequest[]> {
    return this.deps.repository.listByUser(userId);
  }

  /**
   * The Admin's edit. Absent fields keep their stored value rather than
   * clearing, so a stale screen cannot revert a colleague's change; an explicit
   * `null` clears the notes.
   */
  async update(id: string, input: SubscriptionRequestUpdateInput): Promise<SubscriptionRequest> {
    const allowed = await this.deps.checkRateLimit(
      `subscription-edit:${id}`,
      EDIT_LIMIT,
      EDIT_WINDOW_MS
    );
    if (!allowed) throw new SubscriptionRequestRateLimitError();

    const exists = await this.deps.repository.getById(id);
    if (!exists) throw new SubscriptionRequestNotFoundError();

    const patch: SubscriptionRequestUpdate = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes;

    const updated = await this.deps.repository.update(id, patch);

    try {
      this.deps.notifyAdmins?.(updated, 'updated');
    } catch (error) {
      this.deps.captureException?.(error, {
        extra: { source: 'subscription.update.notify', id: updated.id },
      });
    }

    return updated;
  }
}
