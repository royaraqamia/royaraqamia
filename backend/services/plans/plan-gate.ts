import { createHmac } from 'node:crypto';

import { env } from '@/backend/config/env';
import { AppError } from '@/backend/shared/errors';
import type {
  LocalUsageReportInput,
  OwnedItemKey,
  PlanCaps,
  UsageActionKey,
} from '@/shared/contracts/plans';
import type { UsageService } from '@/backend/services/plans/usage-service';

/**
 * What the request knows about who is spending. A signed-in caller spends their
 * own allowance; a visitor spends the shared per-IP allowance, which exists so
 * the public tools stay usable without an account (ADR-0075).
 */
export interface PlanSubject {
  userId: string | null;
  ip?: string | null;
}

/**
 * The ledger's subject for a visitor: a salted hash, never the address itself.
 * The salt is server-only, so a database dump cannot be reversed by enumerating
 * the IPv4 space, and rotating the salt deliberately forgets every visitor's
 * window.
 */
export function hashAnonymousSubject(ip: string): string {
  return createHmac('sha256', env.anonymousIpSalt).update(ip.trim()).digest('hex');
}

/**
 * The one door every metered or capped write goes through.
 *
 * It exists so a controller says what the action is and what to run, and never
 * repeats the "reserve, run, refund" or "resolve the plan, count, compare"
 * choreography — getting that wrong is how a refused action still charges, or a
 * cap check passes because it looked at the wrong plan.
 */
export class PlanGate {
  constructor(private readonly usage: UsageService) {}

  /** Spend for whoever made the request, run the action, refund on failure. */
  async meter<T>(
    subject: PlanSubject,
    actionKey: UsageActionKey,
    run: () => Promise<T>
  ): Promise<T> {
    if (subject.userId) return this.usage.runMetered(subject.userId, actionKey, run);
    if (!subject.ip) {
      throw new AppError('A metered action needs a signed-in user or a client address.', 500);
    }
    return this.usage.runMeteredAnonymous(hashAnonymousSubject(subject.ip), actionKey, run);
  }

  /** Refuse a create that would pass a standing cap. */
  async cap(userId: string, item: OwnedItemKey, incoming = 1): Promise<void> {
    await this.usage.assertOwnedItemCap(userId, item, incoming);
  }

  /** Take one credit without wrapping an action (bulk flows use `meterMany`). */
  reserve(userId: string, actionKey: UsageActionKey): Promise<string | null> {
    return this.usage.reserve(userId, actionKey);
  }

  release(userId: string, eventId: string | null): Promise<void> {
    return this.usage.release(userId, eventId);
  }

  meterMany<T>(
    userId: string,
    actionKey: UsageActionKey,
    count: number,
    run: () => Promise<T>
  ): Promise<T> {
    return this.usage.runMeteredMany(userId, actionKey, count, run);
  }

  /** The caps to cache on the client, resolved for the account's plan. */
  caps(userId: string): Promise<PlanCaps> {
    return this.usage.caps(userId);
  }

  report(userId: string, report: LocalUsageReportInput) {
    return this.usage.reportLocalUsage(userId, report);
  }
}
