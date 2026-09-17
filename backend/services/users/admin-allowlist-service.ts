import type { AdminAllowlistRepository } from '@/backend/repositories/admin/admin-allowlist-repository';
import { isSameAllowlist } from '@/backend/shared/admin-validator';

export interface AllowlistSyncResult {
  /** Whether the database copy already matched the supplied allowlist. */
  inSync: boolean;
  /** Whether the database copy was rewritten by this call. Always false for a dry run. */
  applied: boolean;
  /** Size of the supplied allowlist. */
  allowlistSize: number;
  /** Size of the stored allowlist, before any write. Addresses are never included. */
  databaseSize: number;
}

export class AdminAllowlistService {
  constructor(private readonly repository: AdminAllowlistRepository) {}

  /**
   * Converge the database copy of the Admin allowlist on the supplied one.
   *
   * `dryRun` reports the difference without writing, which is what makes it safe to
   * check that a caller and the app agree before letting anything overwrite the
   * authorization input.
   */
  async sync(emails: string[], options: { dryRun?: boolean } = {}): Promise<AllowlistSyncResult> {
    const current = await this.repository.read();
    const inSync = isSameAllowlist(current, emails);

    if (inSync) {
      return {
        inSync: true,
        applied: false,
        allowlistSize: emails.length,
        databaseSize: current.length,
      };
    }

    if (options.dryRun) {
      return {
        inSync: false,
        applied: false,
        allowlistSize: emails.length,
        databaseSize: current.length,
      };
    }

    await this.repository.sync(emails);

    return {
      inSync: true,
      applied: true,
      allowlistSize: emails.length,
      databaseSize: emails.length,
    };
  }
}
