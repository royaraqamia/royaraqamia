import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import type { AvatarStorageRepository } from '@/backend/repositories/users/avatar-storage-repository';
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES } from '@/shared/contracts/users';

/** The requested handle is already claimed by another member. */
export class UsernameTakenError extends Error {
  constructor() {
    super('المعرِّف مستخدم بالفعل');
    this.name = 'UsernameTakenError';
  }
}

/** The uploaded avatar is not an accepted image, or is too large. */
export class AvatarValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarValidationError';
  }
}

export interface ProfileServiceDeps {
  profiles: UserProfileRepository;
  publicUsers: PublicUsersRepository;
  avatars: AvatarStorageRepository;
}

/**
 * Owns the rules that surround a profile write — chiefly that a handle stays
 * globally unique. The unique index is the backstop; this pre-check turns the
 * common case into a clean 409 instead of a driver error.
 */
export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

  /**
   * Non-throwing counterpart of `updateUsername`'s pre-check, used by the live
   * availability endpoint. A member always "owns" their current handle, so it
   * reads as available rather than taken against themselves.
   */
  async checkUsername(userId: string, username: string): Promise<{ available: boolean }> {
    const existing = await this.deps.publicUsers.getByUsername(username);
    return { available: !existing || existing.id === userId };
  }

  async updateUsername(userId: string, username: string): Promise<{ username: string }> {
    const existing = await this.deps.publicUsers.getByUsername(username);
    if (existing && existing.id !== userId) throw new UsernameTakenError();

    try {
      await this.deps.profiles.updateProfile(userId, { username });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UsernameTakenError();
      throw error;
    }

    return { username };
  }

  /** Change the caller's display name. */
  async updateName(userId: string, name: string): Promise<{ name: string }> {
    await this.deps.profiles.updateProfile(userId, { name });
    return { name };
  }

  /**
   * Replace the caller's avatar. The new object is written first, then the
   * profile row is pointed at it; only after that succeeds is the previous
   * object removed, so a failure never leaves the row pointing at a missing
   * file. A failed row write rolls the fresh upload back.
   */
  async updateAvatar(userId: string, file: File): Promise<{ avatarUrl: string }> {
    this.assertValidAvatar(file);

    const previous = await this.deps.profiles.getById(userId);
    const avatarUrl = await this.deps.avatars.upload(userId, file);

    try {
      await this.deps.profiles.updateProfile(userId, { avatar_url: avatarUrl });
    } catch (error) {
      await this.deps.avatars.remove(avatarUrl).catch(() => {});
      throw error;
    }

    const previousUrl = previous?.avatar_url?.trim();
    if (previousUrl && previousUrl !== avatarUrl) {
      await this.deps.avatars.remove(previousUrl).catch(() => {});
    }

    return { avatarUrl };
  }

  /** Clear the caller's avatar and delete the stored object. */
  async removeAvatar(userId: string): Promise<void> {
    const previous = await this.deps.profiles.getById(userId);
    await this.deps.profiles.updateProfile(userId, { avatar_url: null });

    const previousUrl = previous?.avatar_url?.trim();
    if (previousUrl) {
      await this.deps.avatars.remove(previousUrl).catch(() => {});
    }
  }

  private assertValidAvatar(file: File): void {
    if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      throw new AvatarValidationError('يجب أن يكون الملف صورة صالحة');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new AvatarValidationError('يجب أن تكون الصورة أقل من 5 ميغابايت');
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
