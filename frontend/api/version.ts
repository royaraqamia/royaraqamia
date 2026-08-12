import { request } from '@/frontend/transport/http';

export interface VersionInfo {
  version: string;
  releaseVersion: string;
  commit: string;
  ref: string;
  env: string;
  releasedAt: string;
}

export async function getVersion(): Promise<VersionInfo> {
  return request<VersionInfo>('/api/version', {
    cache: 'no-store',
  });
}
