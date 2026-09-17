import { request } from '@/frontend/transport/http';

export interface Me {
  isAdmin: boolean;
  name: string | null;
}

export async function getMe(): Promise<Me> {
  return request<Me>('/api/me', {
    cache: 'no-store',
  });
}
