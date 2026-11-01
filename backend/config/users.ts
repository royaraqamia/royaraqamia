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
import { createAvatarStorageRepository } from '@/backend/repositories/users/avatar-storage-repository';
import {
  createHiddenServicesRepository,
  type HiddenServicesRepository,
} from '@/backend/repositories/users/hidden-services-repository';
import { AdminUsersService } from '@/backend/services/users/admin-users-service';
import { ProfileService } from '@/backend/services/users/profile-service';
import { HiddenServicesService } from '@/backend/services/users/hidden-services-service';

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
    avatars: createAvatarStorageRepository(client),
  });
}

/**
 * The caller's hidden services (ADR-0112). User-scoped on purpose: the rows are
 * guarded by RLS as well, so the service is not the only thing keeping one
 * member's preference off another's screen.
 */
export function createHiddenServicesService(
  supabase?: SupabaseClient<Database>
): HiddenServicesService {
  const hiddenServices: HiddenServicesRepository = createHiddenServicesRepository(
    supabase ?? getAdminSupabase()
  );
  return new HiddenServicesService({ hiddenServices });
}
