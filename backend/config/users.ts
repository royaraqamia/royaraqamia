import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createAdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';
import {
  createUserProfileRepository,
  type UserProfileRepository,
} from '@/backend/repositories/users/user-profile-repository';
import {
  createPublicUsersRepository,
  type PublicUsersRepository,
} from '@/backend/repositories/users/public-users-repository';
import { AdminUsersService } from '@/backend/services/users/admin-users-service';
import { ProfileService } from '@/backend/services/users/profile-service';

export function createAdminUsersService(supabase?: SupabaseClient<Database>): AdminUsersService {
  return new AdminUsersService(createAdminUsersRepository(supabase ?? getAdminSupabase()));
}

export function createServerUserProfileRepository(
  supabase?: SupabaseClient<Database>
): UserProfileRepository {
  return createUserProfileRepository(supabase ?? getAdminSupabase());
}

/** Public member directory; service-role because `users` is not anon-readable. */
export function createPublicUsersRepositoryServer(
  supabase?: SupabaseClient<Database>
): PublicUsersRepository {
  return createPublicUsersRepository(supabase ?? getAdminSupabase());
}

export function createProfileService(supabase?: SupabaseClient<Database>): ProfileService {
  const client = supabase ?? getAdminSupabase();
  return new ProfileService({
    profiles: createUserProfileRepository(client),
    publicUsers: createPublicUsersRepository(client),
  });
}
