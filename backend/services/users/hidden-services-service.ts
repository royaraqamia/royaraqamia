import type { HiddenServicesRepository } from '@/backend/repositories/users/hidden-services-repository';
import type { HiddenServiceKey } from '@/shared/contracts/hidden-services';

export interface HiddenServicesServiceDeps {
  hiddenServices: HiddenServicesRepository;
}

/**
 * A member's hidden services (ADR-0112).
 *
 * The rules are small and deliberate: the write is the whole set, so the diff
 * against what the account already holds is this service's job rather than the
 * repository's, and a write that changes nothing issues no statement at all —
 * a page that replays a save must not churn rows.
 *
 * Nothing here reads the menu. The catalog is `SERVICE_ROUTES`, the routes are
 * validated by the contract at the edge, and what is stored is what a client
 * filters by string.
 */
export class HiddenServicesService {
  constructor(private readonly deps: HiddenServicesServiceDeps) {}

  async list(userId: string): Promise<string[]> {
    return this.deps.hiddenServices.list(userId);
  }

  /**
   * Make the account's hidden set exactly `hidden`.
   *
   * A route that arrives twice is hidden once (the set), and a route the account
   * did not hold is added rather than overwriting anything — the primary key is
   * the pair, so two devices saving at once converge on the union of their intent
   * and the next read settles the screen.
   */
  async replace(userId: string, hidden: readonly HiddenServiceKey[]): Promise<string[]> {
    const next = new Set<string>(hidden);
    const current = new Set(await this.deps.hiddenServices.list(userId));

    const toAdd = [...next].filter((key) => !current.has(key)) as HiddenServiceKey[];
    const toRemove = [...current].filter((key) => !next.has(key));

    if (toAdd.length > 0) await this.deps.hiddenServices.add(userId, toAdd);
    if (toRemove.length > 0) await this.deps.hiddenServices.remove(userId, toRemove);

    return [...next];
  }
}
