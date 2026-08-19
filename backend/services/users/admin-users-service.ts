import type {
  AdminUsersRepository,
  RecipientEmail,
} from '@/backend/repositories/users/admin-users-repository';
import type { AdminUser } from '@/shared/contracts/users';

export class AdminUsersService {
  constructor(private readonly repository: AdminUsersRepository) {}

  async list(search: string, limit = 50): Promise<AdminUser[]> {
    return this.repository.search(search, limit);
  }

  async findExistingUserIds(ids: string[]): Promise<string[]> {
    return this.repository.findExistingUserIds(ids);
  }

  async findRecipientEmails(ids?: string[]): Promise<RecipientEmail[]> {
    return this.repository.findRecipientEmails(ids);
  }
}
