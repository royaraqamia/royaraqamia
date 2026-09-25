import { randomInt } from 'crypto';
import type { ProjectRequestsRepository } from '@/backend/repositories/project-requests/project-requests-repository';
import { type ProjectRequest, type ProjectRequestInput } from '@/shared/contracts/project-requests';
import { toNullableText } from '@/shared/contracts/text';
import { mintReferenceCode, mintWithUniqueCode } from '@/shared/reference-code';

// A loose per-IP abuse backstop, deliberately fail-open: if the limiter's store
// is unreachable, a lead form must keep accepting leads. The limit is generous
// because a shared network (office, agency) can legitimately send many.
const IP_LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

const PROJECT_REQUEST_REFERENCE_CODE_PREFIX = 'PRJ';
const MAX_REFERENCE_CODE_ATTEMPTS = 3;

export class ProjectRequestRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من المحاولات. الرجاء المحاولة بعد قليل.');
    this.name = 'ProjectRequestRateLimitError';
  }
}

export function generateProjectRequestReferenceCode(): string {
  return mintReferenceCode(PROJECT_REQUEST_REFERENCE_CODE_PREFIX, (maxExclusive) =>
    randomInt(maxExclusive)
  );
}

export interface ProjectRequestNotifier {
  (request: ProjectRequest): void;
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

export class ProjectRequestService {
  constructor(private readonly deps: ProjectRequestServiceDeps) {}

  async submit(
    input: ProjectRequestInput,
    context: SubmitProjectRequestContext
  ): Promise<ProjectRequest> {
    const allowed = await this.deps.checkRateLimit(
      `project-request:${context.ip}`,
      IP_LIMIT,
      WINDOW_MS
    );
    if (!allowed) throw new ProjectRequestRateLimitError();

    const request = await this.insertWithUniqueReference(input, context.userId ?? null);

    try {
      this.deps.notifyAdmins?.(request);
    } catch (error) {
      // The request is already committed — a notify failure must not surface to
      // the visitor as a failed submission.
      this.deps.captureException?.(error, {
        extra: { source: 'projectRequest.submit.notify', id: request.id },
      });
    }

    return request;
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
