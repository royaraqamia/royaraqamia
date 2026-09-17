import { getAdminSupabase } from '@/backend/config/supabase';
import { createAdminAllowlistRepository } from '@/backend/repositories/admin/admin-allowlist-repository';
import { AdminAllowlistService } from '@/backend/services/users/admin-allowlist-service';

export function createAdminAllowlistService(): AdminAllowlistService {
  return new AdminAllowlistService(createAdminAllowlistRepository(getAdminSupabase()));
}
