import { request } from '@/frontend/transport/http';

export async function getVersion(): Promise<string> {
  const { version } = await request<{ version: string }>('/api/version', {
    cache: 'no-store',
  });
  return version;
}
