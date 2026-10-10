import { randomInt } from 'crypto';
import type {
  ProjectRequestEditFields,
  ProjectRequestListQuery,
  ProjectRequestsRepository,
} from '@/backend/repositories/project-requests/project-requests-repository';
import {
  type ProjectRequest,
  type ProjectRequestEditInput,
  type ProjectRequestInput,
  type ProjectRequestUpdateInput,
} from '@/shared/contracts/project-requests';
import { toNullableText } from '@/shared/contracts/text';
import type { Paginated } from '@/shared/pagination';
import { mintReferenceCode, mintWithUniqueCode } from '@/shared/reference-code';

// A loose per-IP abuse backstop, deliberately fail-open: if the limiter's store
// is unreachable, a lead form must keep accepting leads. The limit is generous
// because a shared network (office, agency) can legitimately send many.
const IP_LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

// Edits push an Admin notification each time, so a per-user backstop keeps one
// account from spamming the Admin audience. Generous: correcting a lead a few
// times is normal.
const EDIT_LIMIT = 20;
const EDIT_WINDOW_MS = 10 * 60_000;

const PROJECT_REQUEST_REFERENCE_CODE_PREFIX = 'PRJ';
const MAX_REFERENCE_CODE_ATTEMPTS = 3;

export class ProjectRequestRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من المحاولات. الرجاء المحاولة بعد قليل.');
    this.name = 'ProjectRequestRateLimitError';
  }
}

export class ProjectRequestNotFoundError extends Error {
  constructor() {
    super('الطلب غير موجود.');
    this.name = 'ProjectRequestNotFoundError';
  }
}

export function generateProjectRequestReferenceCode(): string {
  return mintReferenceCode(PROJECT_REQUEST_REFERENCE_CODE_PREFIX, (maxExclusive) =>
    randomInt(maxExclusive)
  );
}

/** Distinguishes a fresh lead from a later visitor correction. */
export type ProjectRequestNotificationEvent = 'created' | 'edited';

export interface ProjectRequestNotifier {
  (request: ProjectRequest, event: ProjectRequestNotificationEvent): void;
}

export interface ProjectRequestServiceDeps {
  repository: ProjectRequestsRepository;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  generateReferenceCode: () => string;
  /** Fail-safe: called after the row is committed, never allowed to throw upstream. */
  notifyAdmins?: ProjectRequestNotifier;
  captureException?: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
}

export interface SubmitProjectRequestContext {
  ip: string;
  /** Present when a signed-in visitor submits; a Project Request never requires auth. */
  userId?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

/** A blank optional field is cleared, never stored as an empty string. */
function toEditFields(input: ProjectRequestEditInput): ProjectRequestEditFields {
  return {
    full_name: input.full_name,
    phone_whatsapp: input.phone_whatsapp,
    email: toNullableText(input.email),
    project_type: input.project_type,
    description: input.description,
    budget_range: toNullableText(input.budget_range),
    timeline: toNullableText(input.timeline),
    existing_url: toNullableText(input.existing_url),
  };
}

export class ProjectRequestService {
  constructor(private readonly deps: ProjectRequestServiceDeps) {}

  async submit(
    input: ProjectRequestInput,
    context: SubmitProjectRequestContext
  ): Promise<ProjectRequest> {
    // An Outbox replay carries a client-minted `client_id`; returning the row it
    // already created keeps the replay idempotent (ADR-0029, ticket #169).
    const clientId = input.client_id ?? null;
    if (clientId) {
      const existing = await this.deps.repository.getByClientId(clientId);
      if (existing) return existing;
    }

    const allowed = await this.deps.checkRateLimit(
      `project-request:${context.ip}`,
      IP_LIMIT,
      WINDOW_MS
    );
    if (!allowed) throw new ProjectRequestRateLimitError();

    const request = await this.insertWithUniqueReference(input, context.userId ?? null);

    try {
      this.deps.notifyAdmins?.(request, 'created');
    } catch (error) {
      // The request is already committed — a notify failure must not surface to
      // the visitor as a failed submission.
      this.deps.captureException?.(error, {
        extra: { source: 'projectRequest.submit.notify', id: request.id },
      });
    }

    return request;
  }

  async list(query: ProjectRequestListQuery): Promise<Paginated<ProjectRequest>> {
    return this.deps.repository.list(query);
  }

  async update(id: string, input: ProjectRequestUpdateInput): Promise<ProjectRequest> {
    const existing = await this.deps.repository.getById(id);
    if (!existing) throw new ProjectRequestNotFoundError();

    return this.deps.repository.updateStatus(id, input.status, toNullableText(input.notes));
  }

  /** The signed-in visitor's own requests, for the account submissions page. */
  async listMine(userId: string): Promise<ProjectRequest[]> {
    return this.deps.repository.listByUser(userId);
  }

  /**
   * Replaces the visitor fields of a request the visitor owns. A missing row
   * and a row owned by someone else are both `NotFound`: the caller must never
   * learn that an id exists but is not theirs. Admins are notified so a lead
   * they already triaged cannot go stale under them.
   */
  async updateOwned(
    userId: string,
    id: string,
    input: ProjectRequestEditInput
  ): Promise<ProjectRequest> {
    const allowed = await this.deps.checkRateLimit(
      `project-request-edit:${userId}`,
      EDIT_LIMIT,
      EDIT_WINDOW_MS
    );
    if (!allowed) throw new ProjectRequestRateLimitError();

    const updated = await this.deps.repository.updateOwned(id, userId, toEditFields(input));
    if (!updated) throw new ProjectRequestNotFoundError();

    try {
      this.deps.notifyAdmins?.(updated, 'edited');
    } catch (error) {
      this.deps.captureException?.(error, {
        extra: { source: 'projectRequest.updateOwned.notify', id: updated.id },
      });
    }

    return updated;
  }

  private async insertWithUniqueReference(
    input: ProjectRequestInput,
    userId: string | null
  ): Promise<ProjectRequest> {
    const payload = {
      full_name: input.full_name,
      phone_whatsapp: input.phone_whatsapp,
      email: toNullableText(input.email),
      project_type: input.project_type,
      description: input.description,
      budget_range: toNullableText(input.budget_range),
      timeline: toNullableText(input.timeline),
      existing_url: toNullableText(input.existing_url),
      user_id: userId,
      client_id: input.client_id ?? null,
    };

    const { result } = await mintWithUniqueCode({
      attempts: MAX_REFERENCE_CODE_ATTEMPTS,
      mint: () => this.deps.generateReferenceCode(),
      isCollision: isUniqueViolation,
      onExhausted: (lastError) => new Error('تعذّر توليد رمز طلب فريد.', { cause: lastError }),
      attempt: (referenceCode) =>
        this.deps.repository.create({ ...payload, reference_code: referenceCode }),
    });

    return result;
  }
}

export function createProjectRequestService(
  deps: ProjectRequestServiceDeps
): ProjectRequestService {
  return new ProjectRequestService(deps);
}
