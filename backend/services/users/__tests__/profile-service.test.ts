import { describe, it, expect, vi } from 'vitest';
import { ProfileService, UsernameTakenError } from '@/backend/services/users/profile-service';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';

function createService(overrides?: { existing?: { id: string } | null; updateError?: unknown }) {
  const updateProfile = overrides?.updateError
    ? vi.fn().mockRejectedValue(overrides.updateError)
    : vi.fn().mockResolvedValue(undefined);
  const profiles = { updateProfile } as unknown as UserProfileRepository;
  const publicUsers = {
    getByUsername: vi.fn().mockResolvedValue(overrides?.existing ?? null),
  } as unknown as PublicUsersRepository;

  return { service: new ProfileService({ profiles, publicUsers }), updateProfile, publicUsers };
}

describe('ProfileService.updateUsername', () => {
  it('persists a handle no one else owns', async () => {
    const { service, updateProfile } = createService({ existing: null });

    const result = await service.updateUsername('u-1', 'ahmad');

    expect(result).toEqual({ username: 'ahmad' });
    expect(updateProfile).toHaveBeenCalledWith('u-1', { username: 'ahmad' });
  });

  it('lets a member keep their own handle', async () => {
    const { service, updateProfile } = createService({ existing: { id: 'u-1' } });

    await service.updateUsername('u-1', 'ahmad');

    expect(updateProfile).toHaveBeenCalledWith('u-1', { username: 'ahmad' });
  });

  it('rejects a handle claimed by another member', async () => {
    const { service, updateProfile } = createService({ existing: { id: 'u-2' } });

    await expect(service.updateUsername('u-1', 'ahmad')).rejects.toBeInstanceOf(UsernameTakenError);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('maps a unique-violation race to a taken handle', async () => {
    const { service } = createService({ existing: null, updateError: { code: '23505' } });

    await expect(service.updateUsername('u-1', 'ahmad')).rejects.toBeInstanceOf(UsernameTakenError);
  });
});
