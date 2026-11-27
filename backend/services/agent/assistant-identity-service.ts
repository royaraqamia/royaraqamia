import type { AssistantIdentityRepository } from '@/backend/repositories/agent/assistant-identity-repository';
import { AppError } from '@/backend/shared/errors';
import {
  AssistantIdentityInputSchema,
  DEFAULT_ASSISTANT_IDENTITY,
  type AssistantIdentity,
} from '@/shared/contracts/assistant-identity';

/**
 * The member's assistant identity (ADR-0224).
 *
 * A member without a row is not an error: they read the deployment's default,
 * which is how every existing member sees نور unchanged on the deploy. A write
 * is validated here — the contract's rules, not the form's — so a hand-written
 * request cannot store a name the prompt must not receive.
 */
export interface AssistantIdentityServiceDeps {
  identities: AssistantIdentityRepository;
  /** Overridable so a test can pin the clock the write stamps. */
  now?: () => Date;
}

const INVALID_REQUEST = 'الطلب غير مكتمل.';
const FAILED = 'تعذّر حفظ بيانات المساعد. الرجاء المحاولة مرة أخرى.';

export class AssistantIdentityService {
  constructor(private readonly deps: AssistantIdentityServiceDeps) {}

  async read(userId: string): Promise<AssistantIdentity> {
    return (await this.deps.identities.read(userId)) ?? DEFAULT_ASSISTANT_IDENTITY;
  }

  /**
   * Replace the row with what the member sent. Every field arrives, because the
   * write is the whole identity: a partial update would need a second rule for
   * "the field that was absent", and the page always holds all four.
   */
  async save(userId: string, body: unknown): Promise<AssistantIdentity> {
    const parsed = AssistantIdentityInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? INVALID_REQUEST, 400);
    }

    const at = (this.deps.now?.() ?? new Date()).toISOString();
    try {
      return await this.deps.identities.upsert(userId, parsed.data, at);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(FAILED, 500);
    }
  }

  /** Back to the deployment's default: the row is deleted, not blanked. */
  async reset(userId: string): Promise<AssistantIdentity> {
    await this.deps.identities.reset(userId);
    return DEFAULT_ASSISTANT_IDENTITY;
  }
}
