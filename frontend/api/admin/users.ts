import type { AdminUser } from '@/shared/contracts/users';
import { request } from '@/frontend/transport/http';

export async function searchUsers(search = '', limit = 50): Promise<AdminUser[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  try {
    const data = await request<{ users: AdminUser[] }>(`/api/admin/users?${params.toString()}`);
    return data.users;
  } catch {
    return [];
  }
}
