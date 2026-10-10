import { randomInt } from 'crypto';
import type {
  TrainingApplicationsRepository,
  TrainingApplicationEditFields,
  TrainingApplicationListQuery,
} from '@/backend/repositories/training/training-applications-repository';
import {
  type TrainingApplication,
  type TrainingApplicationEditInput,
  type TrainingApplicationInput,
  type TrainingApplicationUpdateInput,
  type TrainingReleaseTargetStatus,
} from '@/shared/contracts/training';
import { toNullableText } from '@/shared/contracts/text';
import type { Paginated } from '@/shared/pagination';
import { mintReferenceCode, mintWithUniqueCode } from '@/shared/reference-code';

// The per-IP limit is a loose abuse backstop, not the capacity ceiling: 100+
// students can apply from one shared network (classroom, NAT, campus WiFi), and
// a tight per-IP cap would 429 almost all of them. The global limit is what
// actually bounds total load (DB writes + notification fan-out) under a flood.
// Both are deliberately fail-open: if the limiter's store is unreachable, a lead
// form must keep accepting leads.
const IP_LIMIT = 300;
const GLOBAL_LIMIT = 1_000;
const WINDOW_MS = 10 * 60_000;
const GLOBAL_RATE_LIMIT_KEY = 'training-apply:global';

// Edits push an Admin notification each time, so a per-user backstop keeps one
// account from spamming the Admin audience.
const EDIT_LIMIT = 20;
const EDIT_WINDOW_MS = 10 * 60_000;

const TRAINING_REFERENCE_CODE_PREFIX = 'TRN';
const MAX_REFERENCE_CODE_ATTEMPTS = 3;

// A burst of concurrent applications can make the connection pooler reset a
// socket (ECONNRESET / "fetch failed") or return a transient 5xx. Retrying the
// SAME reference code is safe: the column is UNIQUE, so if the first attempt
// actually committed, the retry collides and we return the stored row instead
// of creating a duplicate.
const MAX_TRANSIENT_ATTEMPTS = 3;
const TRANSIENT_BACKOFF_BASE_MS = 100;

const TRANSIENT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

export class TrainingApplicationClosedError extends Error {
  constructor() {
    super('التقديم على هذه الدورة متوقف حاليًّا.');
    this.name = 'TrainingApplicationClosedError';
  }
}

export class TrainingApplicationRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من المحاولات. الرجاء المحاولة بعد قليل.');
    this.name = 'TrainingApplicationRateLimitError';
  }
}

export class TrainingApplicationNotFoundError extends Error {
  constructor() {
    super('الطلب غير موجود.');
    this.name = 'TrainingApplicationNotFoundError';
  }
}

/**
 * Raised when an applicant tries to change the cohort of an application that is
 * already enrolled. The seat is scarce and moving it is release-then-enroll, not
 * an edit (ADR-0008).
 */
export class TrainingApplicationEnrolledError extends Error {
  constructor() {
    super('لا يمكن تغيير الدُّفعة بعد تأكيد تسجيلك. تواصل معنا لتغييرها.');
    this.name = 'TrainingApplicationEnrolledError';
  }
}

export function generateTrainingReferenceCode(): string {
  return mintReferenceCode(TRAINING_REFERENCE_CODE_PREFIX, (maxExclusive) =>
    randomInt(maxExclusive)
  );
}

/** Distinguishes a fresh application from a later applicant correction. */
export type TrainingApplicationNotificationEvent = 'created' | 'edited';

export interface TrainingApplicationNotifier {
  (application: TrainingApplication, event: TrainingApplicationNotificationEvent): void;
}

export interface TrainingApplicationServiceDeps {
  repository: TrainingApplicationsRepository;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  generateReferenceCode: () => string;
  /**
   * Gates the form. The apply page hides the button when the course is closed,
   * but the URL is public and indexable, so the rule has to hold server-side too.
   */
  isApplicationOpen: () => boolean;
  /** Fail-safe: called after the row is committed, never allowed to throw upstream. */
  notifyAdmins?: TrainingApplicationNotifier;
  captureException?: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
}

export interface SubmitApplicationContext {
  ip: string;
  /** Present when a signed-in visitor applies; applications never require auth. */
  userId?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/** A blank optional field is cleared, never stored as an empty string. */
function toEditFields(input: TrainingApplicationEditInput): TrainingApplicationEditFields {
  return {
    full_name: input.full_name,
    phone_whatsapp: input.phone_whatsapp,
    goal: toNullableText(input.goal),
  };
}

/** Network resets / timeouts / 5xx are worth a bounded retry; validation or
 *  schema errors are not. */
function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message, status } = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) return true;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;
  return (
    typeof message === 'string' && /fetch failed|socket hang up|network|timeout/i.test(message)
  );
}

function matchesPayload(
  application: TrainingApplication,
  payload: {
    course_slug: string;
    full_name: string;
    phone_whatsapp: string;
    user_id: string | null;
  }
): boolean {
  return (
    application.course_slug === payload.course_slug &&
    application.full_name === payload.full_name &&
    application.phone_whatsapp === payload.phone_whatsapp &&
    application.user_id === payload.user_id
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TrainingApplicationService {
  constructor(private readonly deps: TrainingApplicationServiceDeps) {}

  async submit(
    input: TrainingApplicationInput,
    context: SubmitApplicationContext
  ): Promise<TrainingApplication> {
    if (!this.deps.isApplicationOpen()) throw new TrainingApplicationClosedError();

    // An Outbox replay carries a client-minted `client_id`. Returning the row it
    // already created makes the replay idempotent and hands back the same
    // Reference Code without re-notifying admins or spending rate-limit budget.
    const clientId = input.client_id ?? null;
    if (clientId) {
      const existing = await this.deps.repository.getByClientId(clientId);
      if (existing) return existing;
    }

    const ipAllowed = await this.deps.checkRateLimit(
      `training-apply:${context.ip}`,
      IP_LIMIT,
      WINDOW_MS
    );
    if (!ipAllowed) throw new TrainingApplicationRateLimitError();

    const globalAllowed = await this.deps.checkRateLimit(
      GLOBAL_RATE_LIMIT_KEY,
      GLOBAL_LIMIT,
      WINDOW_MS
    );
    if (!globalAllowed) throw new TrainingApplicationRateLimitError();

    const application = await this.insertWithUniqueReference(input, context.userId ?? null);

    try {
      this.deps.notifyAdmins?.(application, 'created');
    } catch (error) {
      // The application is already committed — a notify failure must not surface
      // to the applicant as a failed submission.
      this.deps.captureException?.(error, {
        extra: { source: 'trainingApplication.submit.notify', id: application.id },
      });
    }

    return application;
  }

  async list(query: TrainingApplicationListQuery): Promise<Paginated<TrainingApplication>> {
    return this.deps.repository.list(query);
  }

  /**
   * Applies an operator's manual status/notes change. The one status it refuses
   * to leave via a plain write is `enrolled`: the application holds a scarce
   * seat, so leaving it is `release`, which gives the seat back atomically
   * (ADR-0008). A stale admin list re-saving the row's own `enrolled` status
   * would otherwise leak the seat permanently.
   */
  async update(id: string, input: TrainingApplicationUpdateInput): Promise<TrainingApplication> {
    const existing = await this.deps.repository.getById(id);
    if (!existing) throw new TrainingApplicationNotFoundError();
    if (existing.status === 'enrolled') throw new TrainingApplicationEnrolledError();

    return this.deps.repository.updateStatus(id, input.status, toNullableText(input.notes));
  }

  /** The signed-in applicant's own applications, for the account submissions page. */
  async listMine(userId: string): Promise<TrainingApplication[]> {
    return this.deps.repository.listByUser(userId);
  }

  /**
   * Replaces the visitor fields of an application the applicant owns. The
   * cohort is the sharp edge: while the application is `enrolled` it holds a
   * scarce seat, so a requested change of cohort is refused rather than silently
   * moved — releasing and re-enrolling is what gives one seat back and claims
   * another atomically (ADR-0008). Once not enrolled, the chosen cohort is only
   * a preference, so it may be written directly.
   */
  async updateOwned(
    userId: string,
    id: string,
    input: TrainingApplicationEditInput
  ): Promise<TrainingApplication> {
    const allowed = await this.deps.checkRateLimit(
      `training-edit:${userId}`,
      EDIT_LIMIT,
      EDIT_WINDOW_MS
    );
    if (!allowed) throw new TrainingApplicationRateLimitError();

    const existing = await this.deps.repository.getById(id);
    // A missing row and a row owned by someone else are both absent to this
    // caller; ownership is re-checked in the write predicate below.
    if (!existing || existing.user_id !== userId) throw new TrainingApplicationNotFoundError();

    const enrolled = existing.status === 'enrolled';
    if (enrolled && input.cohort_id !== existing.cohort_id) {
      throw new TrainingApplicationEnrolledError();
    }

    const updated = await this.deps.repository.updateOwned(
      id,
      userId,
      toEditFields(input),
      enrolled ? existing.cohort_id : (input.cohort_id ?? null)
    );
    if (!updated) throw new TrainingApplicationNotFoundError();

    try {
      this.deps.notifyAdmins?.(updated, 'edited');
    } catch (error) {
      this.deps.captureException?.(error, {
        extra: { source: 'trainingApplication.updateOwned.notify', id: updated.id },
      });
    }

    return updated;
  }

  /**
   * Claims a seat: enrolls the application into a cohort. The capacity check and
   * the status write happen atomically inside the `enroll_application` RPC, so
   * there is no count-then-insert race (ADR-0008). Errors cross the repository
   * seam already typed (`CohortFullError`, `CohortClosedError`, …).
   */
  async enroll(id: string, cohortId: string): Promise<TrainingApplication> {
    const existing = await this.deps.repository.getById(id);
    if (!existing) throw new TrainingApplicationNotFoundError();

    return this.deps.repository.enroll(id, cohortId);
  }

  /**
   * Releases the seat: moves the application out of `enrolled` and gives the
   * seat back, atomically, inside the `release_application` RPC.
   */
  async release(
    id: string,
    status: TrainingReleaseTargetStatus,
    notes: string | null
  ): Promise<TrainingApplication> {
    const existing = await this.deps.repository.getById(id);
    if (!existing) throw new TrainingApplicationNotFoundError();

    return this.deps.repository.release(id, status, notes);
  }

  private async insertWithUniqueReference(
    input: TrainingApplicationInput,
    userId: string | null
  ): Promise<TrainingApplication> {
    const payload = {
      course_slug: input.course_slug,
      full_name: input.full_name,
      phone_whatsapp: input.phone_whatsapp,
      goal: toNullableText(input.goal),
      cohort_id: input.cohort_id ?? null,
      user_id: userId,
      client_id: input.client_id ?? null,
    };

    const { result } = await mintWithUniqueCode({
      attempts: MAX_REFERENCE_CODE_ATTEMPTS,
      mint: () => this.deps.generateReferenceCode(),
      isCollision: isUniqueViolation,
      onExhausted: (lastError) => new Error('تعذّر توليد رمز طلب فريد.', { cause: lastError }),
      attempt: async (referenceCode) => {
        let transientAttempts = 0;

        for (;;) {
          try {
            return await this.deps.repository.create({ ...payload, reference_code: referenceCode });
          } catch (error) {
            if (isUniqueViolation(error)) {
              // Either the code genuinely collided (vanishingly rare, 32^8) or our
              // own earlier attempt committed before the connection dropped. Look
              // it up: a matching row means the insert already succeeded.
              const existing = await this.deps.repository.getByReferenceCode(referenceCode);
              if (existing && matchesPayload(existing, payload)) return existing;

              throw error; // genuinely taken — the mint retries with a fresh code
            }

            if (isTransientError(error) && transientAttempts < MAX_TRANSIENT_ATTEMPTS) {
              transientAttempts += 1;
              await sleep(
                TRANSIENT_BACKOFF_BASE_MS * transientAttempts + Math.floor(Math.random() * 50)
              );
              continue; // same code — idempotent if the first attempt committed
            }

            throw error;
          }
        }
      },
    });

    return result;
  }
}

export function createTrainingApplicationService(
  deps: TrainingApplicationServiceDeps
): TrainingApplicationService {
  return new TrainingApplicationService(deps);
}
