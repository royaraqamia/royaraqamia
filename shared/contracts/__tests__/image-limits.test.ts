import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

import { prepareBoundedImage } from '@/backend/services/images/bounded-image';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';
import type { MediaRepository } from '@/backend/repositories/blogpress/media-repository';
import { ProfileService } from '@/backend/services/users/profile-service';
import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import type { AvatarStorageRepository } from '@/backend/repositories/users/avatar-storage-repository';
import { IMAGE_MAX_PIXELS } from '@/shared/contracts/images';

// Both upload paths must hand the one ceiling to the same helper. The helper
// itself is tested against real pixels elsewhere; here only the wiring counts.
vi.mock('@/backend/services/images/bounded-image', () => ({
  prepareBoundedImage: vi.fn(async () => ({
    accepted: true as const,
    file: new File([new Uint8Array(2)], 'bounded.webp', { type: 'image/webp' }),
    pixels: 4,
  })),
}));

const require = createRequire(import.meta.url);

function upload(): File {
  return new File([new Uint8Array(4)], 'cover.png', { type: 'image/png' });
}

describe('the image pixel ceiling', () => {
  it('is the same number in the post service, the avatar service and next.config.js', async () => {
    const mediaRepository = {
      uploadImage: vi.fn().mockResolvedValue({ url: 'https://cdn/cover.webp' }),
      deleteImage: vi.fn(),
      usage: vi.fn().mockResolvedValue({
        memberBytes: 0,
        memberLimitBytes: 1_000_000,
        projectBytes: 0,
        projectLimitBytes: 1_000_000,
      }),
    } as unknown as MediaRepository;
    const profiles = {
      getById: vi.fn().mockResolvedValue({ avatar_url: null }),
      updateProfile: vi.fn().mockResolvedValue(undefined),
    } as unknown as UserProfileRepository;
    const publicUsers = {
      getByUsername: vi.fn().mockResolvedValue(null),
    } as unknown as PublicUsersRepository;
    const avatars = {
      upload: vi.fn().mockResolvedValue('https://cdn/avatar.webp'),
      remove: vi.fn().mockResolvedValue(undefined),
    } as unknown as AvatarStorageRepository;

    const form = new FormData();
    form.append('file', upload());
    await new BlogpressMediaService(mediaRepository).uploadImage(form, 'u-1');
    await new ProfileService({ profiles, publicUsers, avatars }).updateAvatar('u-1', upload());

    expect(vi.mocked(prepareBoundedImage).mock.calls).toEqual([
      [expect.any(File), IMAGE_MAX_PIXELS],
      [expect.any(File), IMAGE_MAX_PIXELS],
    ]);

    const config = require('../../../next.config.js') as {
      experimental: { imgOptMaxInputPixels: number };
    };
    expect(config.experimental.imgOptMaxInputPixels).toBe(IMAGE_MAX_PIXELS);
  });
});
