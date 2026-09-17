import { request } from '@/frontend/transport/http';

export interface MyAdminStatus {
  isAdmin: boolean;
}

export async function getMyAdminStatus(): Promise<MyAdminStatus> {
  return request<MyAdminStatus>('/api/me', {
    cache: 'no-store',
  });
}
