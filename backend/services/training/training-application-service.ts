import { randomInt } from 'crypto';
import type {
  TrainingApplicationsRepository,
  TrainingApplicationListQuery,
} from '@/backend/repositories/training/training-applications-repository';
import {
  toNullableText,
  type TrainingApplication,
  type TrainingApplicationInput,
  type TrainingApplicationUpdateInput,
} from '@/shared/contracts/training';

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

const REFERENCE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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

/** `TRN-2026-A7K2M9QX` — quoted in the WhatsApp handoff, so uppercase only. */
export function generateTrainingReferenceCode(): string {
  const alphabet = REFERENCE_CODE_ALPHABET.split('');
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += alphabet[randomInt(alphabet.length)] ?? '';
  }
  return `TRN-${new Date().getFullYear()}-${suffix}`;
}

export interface TrainingApplicationNotifier {
  (application: TrainingApplication): void;
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
      this.deps.notifyAdmins?.(application);
    } catch (error) {
      // The application is already committed — a notify failure must not surface
      // to the applicant as a failed submission.
      this.deps.captureException?.(error, {
        extra: { source: 'trainingApplication.submit.notify', id: application.id },
      });
    }

    return application;
  }

  async list(
    query: TrainingApplicationListQuery
  ): Promise<{ data: TrainingApplication[]; total: number }> {
    return this.deps.repository.list(query);
  }

  async update(id: string, input: TrainingApplicationUpdateInput): Promise<TrainingApplication> {
    const existing = await this.deps.repository.getById(id);
    if (!existing) throw new TrainingApplicationNotFoundError();

    return this.deps.repository.updateStatus(id, input.status, toNullableText(input.notes));
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
      user_id: userId,
    };

    let referenceCode = this.deps.generateReferenceCode();
    let codeAttempts = 0;
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

          codeAttempts += 1;
          if (codeAttempts >= MAX_REFERENCE_CODE_ATTEMPTS) {
            throw new Error('تعذّر توليد رمز طلب فريد.', { cause: error });
          }
          referenceCode = this.deps.generateReferenceCode();
          continue;
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
  }
}

export function createTrainingApplicationService(
  deps: TrainingApplicationServiceDeps
): TrainingApplicationService {
  return new TrainingApplicationService(deps);
}
