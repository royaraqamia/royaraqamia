import { request } from '@/frontend/transport/http';

export interface Me {
  isAdmin: boolean;
  name: string | null;
  avatarUrl: string | null;
  username: string | null;
}

export async function getMe(): Promise<Me> {
  return request<Me>('/api/me', {
    cache: 'no-store',
  });
}

export async function updateUsername(
  username: string
): Promise<{ success: boolean; username?: string; error?: string }> {
  return request<{ success: boolean; username?: string; error?: string }>('/api/me/username', {
    method: 'PATCH',
    body: JSON.stringify({ username }),
  });
}

/** Live availability probe; `available: false` carries the reason as `error`. */
export async function checkUsernameAvailability(
  username: string
): Promise<{ success: boolean; available: boolean; error?: string }> {
  return request<{ success: boolean; available: boolean; error?: string }>(
    `/api/me/username?username=${encodeURIComponent(username)}`,
    { cache: 'no-store' }
  );
}
