import type { UserProfileRepository } from '@/backend/repositories/users/user-profile-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';

/** The requested handle is already claimed by another member. */
export class UsernameTakenError extends Error {
  constructor() {
    super('المعرّف مستخدم بالفعل');
    this.name = 'UsernameTakenError';
  }
}

export interface ProfileServiceDeps {
  profiles: UserProfileRepository;
  publicUsers: PublicUsersRepository;
}

/**
 * Owns the rules that surround a profile write — chiefly that a handle stays
 * globally unique. The unique index is the backstop; this pre-check turns the
 * common case into a clean 409 instead of a driver error.
 */
export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

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
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
