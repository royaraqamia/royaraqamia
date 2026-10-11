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

export async function updateName(
  name: string
): Promise<{ success: boolean; name?: string; error?: string }> {
  return request<{ success: boolean; name?: string; error?: string }>('/api/me/name', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function uploadAvatar(
  file: File
): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ success: boolean; avatarUrl?: string; error?: string }>('/api/me/avatar', {
    method: 'POST',
    body: formData,
  });
}

export async function removeAvatar(): Promise<{
  success: boolean;
  avatarUrl?: string | null;
  error?: string;
}> {
  return request<{ success: boolean; avatarUrl?: string | null; error?: string }>(
    '/api/me/avatar',
    { method: 'DELETE' }
  );
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
