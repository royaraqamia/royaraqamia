import { randomInt } from 'crypto';
import type {
  RetainerListQuery,
  RetainersRepository,
} from '@/backend/repositories/retainers/retainers-repository';
import {
  type Retainer,
  type RetainerInput,
  type RetainerUpdateInput,
} from '@/shared/contracts/retainers';
import { toNullableText } from '@/shared/contracts/text';
import type { Paginated } from '@/shared/pagination';
import { mintReferenceCode, mintWithUniqueCode } from '@/shared/reference-code';

// A loose per-IP abuse backstop, deliberately fail-open: if the limiter's store
// is unreachable, a lead form must keep accepting leads. The limit is generous
// because a shared network (office, agency) can legitimately send many.
const IP_LIMIT = 10;
const WINDOW_MS = 10 * 60_000;

const RETAINER_REFERENCE_CODE_PREFIX = 'RET';
const MAX_REFERENCE_CODE_ATTEMPTS = 3;

export class RetainerRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من المحاولات. الرجاء المحاولة بعد قليل.');
    this.name = 'RetainerRateLimitError';
  }
}

export class RetainerNotFoundError extends Error {
  constructor() {
    super('العقد غير موجود.');
    this.name = 'RetainerNotFoundError';
  }
}

export function generateRetainerReferenceCode(): string {
  return mintReferenceCode(RETAINER_REFERENCE_CODE_PREFIX, (maxExclusive) =>
    randomInt(maxExclusive)
  );
}

export interface RetainerNotifier {
  (retainer: Retainer): void;
}

export interface RetainerServiceDeps {
  repository: RetainersRepository;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  generateReferenceCode: () => string;
  /** Fail-safe: called after the row is committed, never allowed to throw upstream. */
  notifyAdmins?: RetainerNotifier;
  captureException?: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
}

export interface SubmitRetainerContext {
  ip: string;
  /** Present when a signed-in visitor submits; a Retainer request never requires auth. */
  userId?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

export class RetainerService {
  constructor(private readonly deps: RetainerServiceDeps) {}

  async submit(input: RetainerInput, context: SubmitRetainerContext): Promise<Retainer> {
    const allowed = await this.deps.checkRateLimit(`retainer:${context.ip}`, IP_LIMIT, WINDOW_MS);
    if (!allowed) throw new RetainerRateLimitError();

    const retainer = await this.insertWithUniqueReference(input, context.userId ?? null);

    try {
      this.deps.notifyAdmins?.(retainer);
    } catch (error) {
      // The request is already committed — a notify failure must not surface to
      // the visitor as a failed submission.
      this.deps.captureException?.(error, {
        extra: { source: 'retainer.submit.notify', id: retainer.id },
      });
    }

    return retainer;
  }

  async list(query: RetainerListQuery): Promise<Paginated<Retainer>> {
    return this.deps.repository.list(query);
  }

  /**
   * The Admin's edit of an existing retainer, carrying only the fields that
   * changed. Absent fields keep their stored value rather than clearing: the fee
   * is an agreement (falling back to the advertised figure would lose it) and
   * `paid_through` records money already collected. An explicit `null` clears
   * `notes` or `paid_through`.
   */
  async update(id: string, input: RetainerUpdateInput): Promise<Retainer> {
    const existing = await this.deps.repository.getById(id);
    if (!existing) throw new RetainerNotFoundError();

    return this.deps.repository.update(id, {
      status: input.status ?? existing.status,
      notes: input.notes === undefined ? existing.notes : toNullableText(input.notes),
      monthly_fee_usd: input.monthly_fee_usd ?? existing.monthly_fee_usd,
      paid_through:
        input.paid_through === undefined
          ? existing.paid_through
          : toNullableText(input.paid_through),
    });
  }

  private async insertWithUniqueReference(
    input: RetainerInput,
    userId: string | null
  ): Promise<Retainer> {
    // The agreed fee is not the visitor's to set: the table defaults it to the
    // advertised figure and the Admin records what was actually agreed.
    const payload = {
      full_name: input.full_name,
      phone_whatsapp: input.phone_whatsapp,
      email: toNullableText(input.email),
      company: toNullableText(input.company),
      current_projects: input.current_projects,
      needs: input.needs,
      preferred_start: toNullableText(input.preferred_start),
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

export function createRetainerService(deps: RetainerServiceDeps): RetainerService {
  return new RetainerService(deps);
}
