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

// 5 submissions per 10 minutes per IP. Deliberately fail-open: if the limiter's
// store is unreachable, a lead form must keep accepting leads.
const IP_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

const REFERENCE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_REFERENCE_CODE_ATTEMPTS = 3;

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

export class TrainingApplicationService {
  constructor(private readonly deps: TrainingApplicationServiceDeps) {}

  async submit(
    input: TrainingApplicationInput,
    context: SubmitApplicationContext
  ): Promise<TrainingApplication> {
    if (!this.deps.isApplicationOpen()) throw new TrainingApplicationClosedError();

    const allowed = await this.deps.checkRateLimit(
      `training-apply:${context.ip}`,
      IP_LIMIT,
      WINDOW_MS
    );
    if (!allowed) throw new TrainingApplicationRateLimitError();

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
      email: toNullableText(input.email),
      experience_level: input.experience_level,
      goal: toNullableText(input.goal),
      user_id: userId,
    };

    for (let attempt = 0; attempt < MAX_REFERENCE_CODE_ATTEMPTS; attempt++) {
      try {
        return await this.deps.repository.create({
          ...payload,
          reference_code: this.deps.generateReferenceCode(),
        });
      } catch (error) {
        // A collision on reference_code is vanishingly rare (32^8), but the
        // column is UNIQUE — retry with a fresh code rather than 500.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw new Error('تعذّر توليد رمز طلب فريد.');
  }
}

export function createTrainingApplicationService(
  deps: TrainingApplicationServiceDeps
): TrainingApplicationService {
  return new TrainingApplicationService(deps);
}
