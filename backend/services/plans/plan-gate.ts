import { createHmac } from 'node:crypto';

import { env } from '@/backend/config/env';
import { AppError } from '@/backend/shared/errors';
import type {
  LocalUsageReportInput,
  OwnedItemKey,
  PlanCaps,
  UsageCounterKey,
} from '@/shared/contracts/plans';
import type { CounterSubject, UsageService } from '@/backend/services/plans/usage-service';

/**
 * What the request knows about who is being counted. A signed-in caller counts
 * against their own allowance; a visitor counts against the pair (cookie,
 * salted address), which exists so the public tools stay usable without an
 * account (ADR-0093).
 */
export interface PlanSubject {
  userId: string | null;
  visitorKey?: string | null;
  ip?: string | null;
}

/**
 * The ledger's address half for a visitor: a salted hash, never the address
 * itself. The salt is server-only, so a database dump cannot be reversed by
 * enumerating the IPv4 space, and rotating the salt deliberately forgets every
 * visitor's allowance.
 */
export function hashAnonymousSubject(ip: string): string {
  return createHmac('sha256', env.anonymousIpSalt).update(ip.trim()).digest('hex');
}

/**
 * A counted action already written to the ledger, held open by the caller
 * because the work it pays for finishes after the response. It carries the
 * subject it was counted against, so a visitor's anonymous event is released
 * exactly like a member's and the caller never re-supplies who was counted.
 */
export interface Reservation {
  readonly eventId: string | null;
  release(): Promise<void>;
}

/**
 * The one door every counted or capped write goes through.
 *
 * It exists so a controller says what the action is and what to run, and never
 * repeats the "count, run, release" or "resolve the plan, count, compare"
 * choreography — getting that wrong is how a refused action still counts, or a
 * cap check passes because it looked at the wrong plan.
 */
export class PlanGate {
  constructor(private readonly usage: UsageService) {}

  /** Count one action, run the work, and release the count if the work failed. */
  async count<T>(
    subject: PlanSubject,
    actionKey: UsageCounterKey,
    run: () => Promise<T>,
    options: { dedupeKey?: string | null } = {}
  ): Promise<T> {
    const reservation = await this.reserve(subject, actionKey, options);

    try {
      return await run();
    } catch (error) {
      await reservation.release();
      throw error;
    }
  }

  /**
   * Count one action and hold it for work that outlives the request — a
   * Download is dispatched after the response, so it cannot be wrapped by
   * `count` in one closure. Releasing gives the count back; a reservation left
   * alone is a spend (ADR-0093).
   */
  async reserve(
    subject: PlanSubject,
    actionKey: UsageCounterKey,
    options: { dedupeKey?: string | null } = {}
  ): Promise<Reservation> {
    const counted = this.subject(subject);
    const eventId = await this.usage.consume(counted, actionKey, options);

    return {
      eventId,
      release: () => this.usage.release(counted.userId, eventId),
    };
  }

  /** Refuse a create that would pass a standing cap. */
  async cap(userId: string, item: OwnedItemKey, incoming = 1): Promise<void> {
    await this.usage.assertOwnedItemCap(userId, item, incoming);
  }

  /** The allowances to cache on the client, resolved for the account's plan. */
  caps(userId: string): Promise<PlanCaps> {
    return this.usage.caps(userId);
  }

  report(userId: string, report: LocalUsageReportInput) {
    return this.usage.reportLocalUsage(userId, report);
  }

  private subject(subject: PlanSubject): CounterSubject {
    if (subject.userId) return { userId: subject.userId };

    const visitorKey = subject.visitorKey ?? null;
    const ipHash = subject.ip ? hashAnonymousSubject(subject.ip) : null;

    if (!visitorKey && !ipHash) {
      throw new AppError('A counted action needs a signed-in user or a visitor.', 500);
    }

    return { userId: null, visitorKey, ipHash };
  }
}
