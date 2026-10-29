import { AppError } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import type { UsageRepository } from '@/backend/repositories/plans/usage-repository';
import {
  type ActivatePlanInput,
  type ActivationResult,
  type AdminPlansQuery,
  type AdminUserUsagePage,
  type LocalUsageReportInput,
  type LocalUsageReportResult,
  type MyPlan,
  type OwnedItemKey,
  type PlanCaps,
  type PlanId,
  type PlanLimit,
  type PlanSettings,
  type UsageCounterKey,
  type UsageCounterState,
  type UsageLimit,
  type UsageState,
} from '@/shared/contracts/plans';

/**
 * Who is being counted. A signed-in caller counts against their own allowance;
 * a visitor counts against the pair (cookie, salted address), which is one
 * allowance even when the cookie is cleared (ADR-0093).
 */
export interface CounterSubject {
  userId: string | null;
  visitorKey?: string | null;
  ipHash?: string | null;
}

/**
 * A counted action, used up. 402 is the honest status: the request is
 * well-formed and the user is allowed to make it, but their allowance is gone.
 * The code says which remedy applies — signing in for a visitor, upgrading for
 * a member (ADR-0093).
 */
export class UsageLimitReachedError extends AppError {
  constructor(
    readonly state: UsageCounterState,
    readonly visitor: boolean
  ) {
    super(
      visitor
        ? 'انتهت حصَّتك كزائر لهذا الحدّ. سجِّل الدُّخول لمتابعة الاستخدام.'
        : `بلغتَ الحدّ الأعلى للخطة الحالية (${state.cap}) لهذا العنصر. ارتقِ إلى الخطة المدفوعة للمتابعة.`,
      402,
      visitor ? 'visitor_limit' : 'usage_limit'
    );
  }
}

export class PlanTargetNotFoundError extends AppError {
  constructor() {
    super('المستخدم غير موجود.', 404, 'user_not_found');
  }
}

/**
 * A standing cap, reached. The remedy is the same as an empty allowance —
 * upgrade — so it answers 402 too, with a code the client can tell apart: the
 * account is not out of actions, it is out of slots for one kind of item.
 */
export class OwnedItemCapReachedError extends AppError {
  constructor(
    readonly item: OwnedItemKey,
    readonly cap: number,
    readonly count: number
  ) {
    super(
      `بلغتَ الحدّ الأعلى للخطة الحالية (${cap}). احذف عنصرًا أو ارتقِ إلى الخطة المدفوعة.`,
      402,
      'owned_item_cap'
    );
  }
}

/**
 * Reads and counts the plan allowance. It holds no counting arithmetic: the
 * count, the cap and the atomic insert all live in Postgres (ADR-0093), so two
 * concurrent requests cannot both take the last slot. This layer decides what a
 * refusal means to the caller.
 */
export class UsageService {
  constructor(private readonly repository: UsageRepository) {}

  getSettings(): Promise<PlanSettings> {
    return this.repository.getSettings();
  }

  listLimits(): Promise<PlanLimit[]> {
    return this.repository.listLimits();
  }

  listCounters(): Promise<UsageLimit[]> {
    return this.repository.listCounters();
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
   * Count one action, or throw the refusal. A refusal wrote nothing, so there
   * is nothing to give back; a caller whose work then fails uses `release`.
   */
  async consume(
    subject: CounterSubject,
    actionKey: UsageCounterKey,
    options: { dedupeKey?: string | null; clientEventId?: string | null } = {}
  ): Promise<string | null> {
    const outcome = await this.repository.record({
      actionKey,
      userId: subject.userId,
      visitorKey: subject.visitorKey ?? null,
      ipHash: subject.ipHash ?? null,
      dedupeKey: options.dedupeKey ?? null,
      clientEventId: options.clientEventId ?? null,
    });

    if (!outcome.allowed) {
      throw new UsageLimitReachedError(outcome.state, subject.userId === null);
    }

    return outcome.eventId;
  }

  /** Count the action, run the work, and release the count if the work failed. */
  async runCounted<T>(
    subject: CounterSubject,
    actionKey: UsageCounterKey,
    run: () => Promise<T>,
    options: { dedupeKey?: string | null } = {}
  ): Promise<T> {
    const eventId = await this.consume(subject, actionKey, options);

    try {
      return await run();
    } catch (error) {
      await this.release(subject.userId, eventId);
      throw error;
    }
  }

  /** Give a count back. Never throws: the caller's real error is the one to show. */
  async release(userId: string | null, eventId: string | null): Promise<void> {
    if (!eventId) return;
    try {
      await this.repository.release(userId, eventId);
    } catch (error) {
      logger.warn('Failed to release a counted action', { error: String(error) });
    }
  }

  /**
   * Refuse a create that would pass a standing cap. Admins are exempt because
   * their allowance is reported as unlimited; existing over-cap data is
   * grandfathered by construction — the check runs before a new item is added,
   * never over what the account already holds.
   *
   * This is a fast refusal, not the enforcement point (#526): the row-level
   * trigger in Postgres does the same count inside the writing transaction and
   * under an advisory lock, so a direct Data API write or two concurrent creates
   * cannot outrun it. What this adds on the happy path is the upgrade nudge
   * before any work happens.
   */
  async assertOwnedItemCap(userId: string, item: OwnedItemKey, incoming = 1): Promise<UsageState> {
    const state = await this.repository.getState(userId);
    if (state.unlimited) return state;

    const [cap, count] = await Promise.all([
      this.ownedItemCap(item, state.plan),
      this.repository.countOwned(item, userId),
    ]);

    if (count + incoming > cap) throw new OwnedItemCapReachedError(item, cap, count);
    return state;
  }

  /** The account's allowances, resolved for its current plan. */
  async caps(userId: string): Promise<PlanCaps> {
    const [state, limits, counters] = await Promise.all([
      this.repository.getState(userId),
      this.repository.listLimits(),
      this.repository.listCounters(),
    ]);

    const resolved = state.unlimited || state.plan === 'pro';

    const caps = limits.reduce(
      (all, limit) => {
        all[limit.key as OwnedItemKey] = resolved ? limit.proCap : limit.freeCap;
        return all;
      },
      {} as Record<OwnedItemKey, number>
    );

    const counterCaps = counters.reduce(
      (all, limit) => {
        all[limit.key as UsageCounterKey] = {
          window: limit.window,
          cap: resolved ? limit.proCap : limit.freeCap,
        };
        return all;
      },
      {} as PlanCaps['counters']
    );

    return { plan: state.plan, unlimited: state.unlimited, caps, counters: counterCaps };
  }

  /**
   * Reconciliation for the counters a device keeps itself (a scan, a surah read
   * today). Each event carries a client id, so replaying a report never counts
   * twice; a refusal leaves the event unrecorded and the caller is told how many
   * were refused.
   */
  async reportLocalUsage(
    userId: string,
    report: LocalUsageReportInput
  ): Promise<LocalUsageReportResult> {
    let recorded = 0;
    let alreadyRecorded = 0;
    let refused = 0;

    for (const event of report.events) {
      const outcome = await this.repository.record({
        actionKey: event.actionKey,
        userId,
        clientEventId: event.clientEventId,
      });

      if (!outcome.allowed) refused += 1;
      else if (outcome.duplicate) alreadyRecorded += 1;
      else recorded += 1;
    }

    const state = await this.repository.getState(userId);
    return { recorded, alreadyRecorded, refused, state };
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
