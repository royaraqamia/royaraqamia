import { describe, it, expect, vi } from 'vitest';
import {
  AvatarValidationError,
  ProfileService,
  UsernameTakenError,
} from '@/backend/services/users/profile-service';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import type { AvatarStorageRepository } from '@/backend/repositories/users/avatar-storage-repository';

function createService(overrides?: {
  existing?: { id: string } | null;
  updateError?: unknown;
  profile?: { avatar_url: string | null } | null;
  uploadError?: unknown;
}) {
  const updateProfile = overrides?.updateError
    ? vi.fn().mockRejectedValue(overrides.updateError)
    : vi.fn().mockResolvedValue(undefined);
  const getById = vi
    .fn()
    .mockResolvedValue(overrides?.profile === undefined ? { avatar_url: null } : overrides.profile);
  const profiles = { updateProfile, getById } as unknown as UserProfileRepository;
  const publicUsers = {
    getByUsername: vi.fn().mockResolvedValue(overrides?.existing ?? null),
  } as unknown as PublicUsersRepository;
  const avatars = {
    upload: overrides?.uploadError
      ? vi.fn().mockRejectedValue(overrides.uploadError)
      : vi.fn().mockResolvedValue('https://cdn.test/avatars/u-1/new.png'),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as AvatarStorageRepository;

  return {
    service: new ProfileService({ profiles, publicUsers, avatars }),
    updateProfile,
    getById,
    publicUsers,
    avatars,
  };
}

function png(size = 1024): File {
  return new File([new Uint8Array(size)], 'me.png', { type: 'image/png' });
}

describe('ProfileService.checkUsername', () => {
  it('reports a handle no one owns as available', async () => {
    const { service } = createService({ existing: null });

    await expect(service.checkUsername('u-1', 'ahmad')).resolves.toEqual({ available: true });
  });

  it("reports the caller's own handle as available", async () => {
    const { service } = createService({ existing: { id: 'u-1' } });

    await expect(service.checkUsername('u-1', 'ahmad')).resolves.toEqual({ available: true });
  });

  it("reports another member's handle as taken", async () => {
    const { service } = createService({ existing: { id: 'u-2' } });

    await expect(service.checkUsername('u-1', 'ahmad')).resolves.toEqual({ available: false });
  });
});

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

describe('ProfileService.updateName', () => {
  it('persists the display name', async () => {
    const { service, updateProfile } = createService();

    await expect(service.updateName('u-1', 'Ahmad')).resolves.toEqual({ name: 'Ahmad' });
    expect(updateProfile).toHaveBeenCalledWith('u-1', { name: 'Ahmad' });
  });
});

describe('ProfileService.updateAvatar', () => {
  it('uploads, points the profile at the new URL, then deletes the old object', async () => {
    const { service, avatars, updateProfile } = createService({
      profile: { avatar_url: 'https://cdn.test/avatars/u-1/old.png' },
    });

    const result = await service.updateAvatar('u-1', png());

    expect(result).toEqual({ avatarUrl: 'https://cdn.test/avatars/u-1/new.png' });
    expect(updateProfile).toHaveBeenCalledWith('u-1', {
      avatar_url: 'https://cdn.test/avatars/u-1/new.png',
    });
    expect(avatars.remove).toHaveBeenCalledWith('https://cdn.test/avatars/u-1/old.png');
  });

  it('rejects a non-image upload without touching storage', async () => {
    const { service, avatars } = createService();
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

    await expect(service.updateAvatar('u-1', file)).rejects.toBeInstanceOf(AvatarValidationError);
    expect(avatars.upload).not.toHaveBeenCalled();
  });

  it('rejects an oversized image', async () => {
    const { service, avatars } = createService();

    await expect(service.updateAvatar('u-1', png(5 * 1024 * 1024 + 1))).rejects.toBeInstanceOf(
      AvatarValidationError
    );
    expect(avatars.upload).not.toHaveBeenCalled();
  });

  it('rolls the fresh upload back when the row write fails', async () => {
    const { service, avatars } = createService({ updateError: new Error('db down') });

    await expect(service.updateAvatar('u-1', png())).rejects.toThrow('db down');
    expect(avatars.remove).toHaveBeenCalledWith('https://cdn.test/avatars/u-1/new.png');
  });
});

describe('ProfileService.removeAvatar', () => {
  it('clears the column and deletes the stored object', async () => {
    const { service, avatars, updateProfile } = createService({
      profile: { avatar_url: 'https://cdn.test/avatars/u-1/old.png' },
    });

    await service.removeAvatar('u-1');

    expect(updateProfile).toHaveBeenCalledWith('u-1', { avatar_url: null });
    expect(avatars.remove).toHaveBeenCalledWith('https://cdn.test/avatars/u-1/old.png');
  });

  it('does nothing extra when there is no stored avatar', async () => {
    const { service, avatars, updateProfile } = createService({ profile: { avatar_url: null } });

    await service.removeAvatar('u-1');

    expect(updateProfile).toHaveBeenCalledWith('u-1', { avatar_url: null });
    expect(avatars.remove).not.toHaveBeenCalled();
  });
});
