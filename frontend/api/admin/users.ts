import type { AdminUser } from '@/shared/contracts/users';
import { request } from '@/frontend/transport/http';

/**
 * Admin user lookup for the pickers.
 *
 * It throws rather than answering `[]`: an empty result is information ("nobody
 * matches that search") and a failed request is not, and the picker can only
 * tell them apart if this lets the failure through (#368).
 */
export async function searchUsers(search = '', limit = 50): Promise<AdminUser[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  const data = await request<{ users: AdminUser[] }>(`/api/admin/users?${params.toString()}`);
  return data.users;
}
