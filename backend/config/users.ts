import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createAdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';
import { AdminUsersService } from '@/backend/services/users/admin-users-service';

export function createAdminUsersService(supabase?: SupabaseClient<Database>): AdminUsersService {
  return new AdminUsersService(createAdminUsersRepository(supabase ?? getAdminSupabase()));
}
