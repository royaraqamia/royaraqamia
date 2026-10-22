import { AppError } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import type { UsageRepository } from '@/backend/repositories/plans/usage-repository';
import {
  type ActivatePlanInput,
  type ActivationResult,
  type AdminPlansQuery,
  type AdminUserUsagePage,
  type MyPlan,
  type OwnedItemKey,
  type PlanId,
  type PlanLimit,
  type PlanSettings,
  type UsageActionCost,
  type UsageActionKey,
  type UsageState,
} from '@/shared/contracts/plans';

/**
 * The allowance a refused action produced. 402 is the honest status: the
 * request is well-formed and the user is allowed to make it, but the plan's
 * allowance is spent (ADR-0075).
 */
export class InsufficientCreditsError extends AppError {
  constructor(readonly state: UsageState) {
    super(
      'نفدت حصَّتك لهذه الفترة. ارتقِ إلى الخطة المدفوعة للمتابعة.',
      402,
      'insufficient_credits'
    );
  }
}

/**
 * A visitor's allowance, exhausted. Distinct from the signed-in refusal: the
 * remedy is signing in, not upgrading, and the caller says so.
 */
export class AnonymousAllowanceExhaustedError extends AppError {
  constructor(
    readonly cap: number,
    readonly spent: number,
    readonly remaining: number
  ) {
    super('انتهت حصَّتك اليومية كزائر. سجِّل الدُّخول لمتابعة الاستخدام.', 402, 'anonymous_limit');
  }
}

export class PlanTargetNotFoundError extends AppError {
  constructor() {
    super('المستخدم غير موجود.', 404, 'user_not_found');
  }
}

/**
 * Reads and spends the plan allowance. It holds no window arithmetic: the
 * rolling 30-day sum, the cap and the atomic insert all live in Postgres
 * (ADR-0075), so two concurrent requests cannot both spend the last credit.
 * This layer decides what a refusal means to the caller.
 */
export class UsageService {
  constructor(private readonly repository: UsageRepository) {}

  getSettings(): Promise<PlanSettings> {
    return this.repository.getSettings();
  }

  listLimits(): Promise<PlanLimit[]> {
    return this.repository.listLimits();
  }

  listActionCosts(): Promise<UsageActionCost[]> {
    return this.repository.listActionCosts();
  }

  state(userId: string): Promise<UsageState> {
    return this.repository.getState(userId);
  }

  /** The account's plan page: the allowance and every grant it came from. */
  async myPlan(userId: string): Promise<MyPlan> {
    const [state, activations] = await Promise.all([
      this.repository.getState(userId),
      this.repository.listActivations(userId),
    ]);

    return { state, activations };
  }

  /**
   * Spend, run the action, and give the credit back if the action failed.
   *
   * The reservation is taken first so concurrent requests cannot overrun the
   * cap; the refund is what keeps the "charged when it succeeded" promise when
   * the write behind the action throws. A refund that itself fails is logged,
   * never surfaced: the user's real error is the action's.
   */
  async runMetered<T>(
    userId: string,
    actionKey: UsageActionKey,
    run: () => Promise<T>
  ): Promise<T> {
    const outcome = await this.repository.spend(userId, actionKey);
    if (!outcome.allowed) throw new InsufficientCreditsError(outcome.state);

    try {
      return await run();
    } catch (error) {
      await this.refundQuietly(() => this.repoRefund(userId, outcome.eventId));
      throw error;
    }
  }

  async runMeteredAnonymous<T>(
    ipHash: string,
    actionKey: UsageActionKey,
    run: () => Promise<T>
  ): Promise<T> {
    const outcome = await this.repository.spendAnonymous(ipHash, actionKey);
    if (!outcome.allowed) {
      throw new AnonymousAllowanceExhaustedError(outcome.cap, outcome.spent, outcome.remaining);
    }

    try {
      return await run();
    } catch (error) {
      await this.refundQuietly(() => this.repoRefundAnonymous(ipHash, outcome.eventId));
      throw error;
    }
  }

  async refund(userId: string, eventId: string | null): Promise<boolean> {
    return this.repoRefund(userId, eventId);
  }

  private async repoRefund(userId: string, eventId: string | null): Promise<boolean> {
    // An Admin's spend (or a refusal) wrote no event, so there is nothing to
    // return. Not an error: the action still failed for its own reason.
    if (!eventId) return false;
    return this.repository.refund(userId, eventId);
  }

  private async repoRefundAnonymous(ipHash: string, eventId: string | null): Promise<boolean> {
    if (!eventId) return false;
    return this.repository.refundAnonymous(ipHash, eventId);
  }

  private async refundQuietly(refund: () => Promise<boolean>): Promise<void> {
    try {
      await refund();
    } catch (error) {
      logger.warn('Failed to refund a metered credit', { error: String(error) });
    }
  }

  async ownedItemCap(item: OwnedItemKey, plan: PlanId): Promise<number> {
    const limits = await this.repository.listLimits();
    const limit = limits.find((entry) => entry.key === item);
    if (!limit) throw new AppError(`Unknown owned-item cap: ${item}`, 500);
    return plan === 'pro' ? limit.proCap : limit.freeCap;
  }

  async activate(
    input: Omit<ActivatePlanInput, 'userId'> & { userId: string },
    activatedBy: string
  ): Promise<ActivationResult> {
    if (!(await this.repository.userExists(input.userId))) {
      throw new PlanTargetNotFoundError();
    }

    return this.repository.activate({ ...input, activatedBy });
  }

  listUsers(query: AdminPlansQuery): Promise<AdminUserUsagePage> {
    return this.repository.listUsers(query);
  }
}
