import { describe, it, expect, vi } from 'vitest';
import { AdminUsersService } from '@/backend/services/users/admin-users-service';
import type { AdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';
import type { AdminUser } from '@/shared/contracts/users';

const sampleUsers: AdminUser[] = [
  { id: 'u-1', name: 'أحمد محمد', email: 'ahmed@example.com', avatar_url: null },
];

function makeRepo(overrides: Partial<AdminUsersRepository> = {}) {
  const repository: AdminUsersRepository = {
    search: vi.fn(),
    findExistingUserIds: vi.fn(),
    findRecipientEmails: vi.fn(),
    ...overrides,
  };
  return { repository, service: new AdminUsersService(repository) };
}

describe('AdminUsersService', () => {
  describe('list', () => {
    it('delegates a search to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.search as ReturnType<typeof vi.fn>).mockResolvedValue(sampleUsers);

      await expect(service.list('أحمد', 25)).resolves.toEqual(sampleUsers);
      expect(repository.search).toHaveBeenCalledWith('أحمد', 25);
    });

    it('defaults the limit to 50', async () => {
      const { repository, service } = makeRepo();
      (repository.search as ReturnType<typeof vi.fn>).mockResolvedValue(sampleUsers);

      await service.list('');
      expect(repository.search).toHaveBeenCalledWith('', 50);
    });
  });

  describe('findExistingUserIds', () => {
    it('delegates to the repository', async () => {
      const { repository, service } = makeRepo();
      (repository.findExistingUserIds as ReturnType<typeof vi.fn>).mockResolvedValue(['u-1']);

      await expect(service.findExistingUserIds(['u-1', 'u-999'])).resolves.toEqual(['u-1']);
      expect(repository.findExistingUserIds).toHaveBeenCalledWith(['u-1', 'u-999']);
    });
  });
});
