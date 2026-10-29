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
    return this.usage.runCounted(this.subject(subject), actionKey, run, options);
  }

  /**
   * Count one action without wrapping any work (an open the request already
   * answered). Returns the event id, which a later failure can release.
   */
  claim(
    subject: PlanSubject,
    actionKey: UsageCounterKey,
    options: { dedupeKey?: string | null } = {}
  ): Promise<string | null> {
    return this.usage.consume(this.subject(subject), actionKey, options);
  }

  /** Refuse a create that would pass a standing cap. */
  async cap(userId: string, item: OwnedItemKey, incoming = 1): Promise<void> {
    await this.usage.assertOwnedItemCap(userId, item, incoming);
  }

  release(userId: string | null, eventId: string | null): Promise<void> {
    return this.usage.release(userId, eventId);
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
