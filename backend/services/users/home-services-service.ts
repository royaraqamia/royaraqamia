import type { HomeServicesRepository } from '@/backend/repositories/users/home-services-repository';
import type { HomeServiceKey } from '@/shared/contracts/home-services';

export interface HomeServicesServiceDeps {
  homeServices: HomeServicesRepository;
}

/**
 * The apps a member keeps on the homepage (ADR-0143).
 *
 * The write is the whole ordered list, so the service does not reconcile a
 * delta: it hands the repository the set and the order the client last drew.
 * A key that arrives twice is stored once (the primary key), and the first
 * occurrence wins the position, which keeps a duplicated write idempotent
 * rather than reordering the strip behind the user.
 */
export class HomeServicesService {
  constructor(private readonly deps: HomeServicesServiceDeps) {}

  async list(userId: string): Promise<string[]> {
    return this.deps.homeServices.list(userId);
  }

  async replace(userId: string, services: readonly HomeServiceKey[]): Promise<string[]> {
    const ordered = [...new Set<string>(services)] as HomeServiceKey[];
    await this.deps.homeServices.replace(userId, ordered);
    return ordered;
  }
}
