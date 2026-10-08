import type {
  DownloadBlockKind,
  DownloadBlocklistEntry,
  DownloadJobPage,
  DownloadPlatformView,
  DownloadSettings,
} from '@/shared/contracts/downloader';
import { request } from '@/frontend/transport/http';

export interface DownloadJobFilters {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

export async function fetchDownloadJobs(
  filters: DownloadJobFilters = {}
): Promise<DownloadJobPage> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);

  const data = await request<DownloadJobPage>(`/api/admin/downloader/jobs?${params.toString()}`);
  return { jobs: data.jobs, total: data.total, page: data.page, pageSize: data.pageSize };
}

export async function fetchDownloadBlocklist(): Promise<DownloadBlocklistEntry[]> {
  const data = await request<{ entries: DownloadBlocklistEntry[] }>(
    '/api/admin/downloader/blocklist'
  );
  return data.entries;
}

export async function addDownloadBlock(input: {
  kind: DownloadBlockKind;
  value: string;
}): Promise<DownloadBlocklistEntry> {
  const data = await request<{ entry: DownloadBlocklistEntry }>('/api/admin/downloader/blocklist', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.entry;
}

export async function removeDownloadBlock(id: string): Promise<void> {
  await request(`/api/admin/downloader/blocklist/${id}`, { method: 'DELETE' });
}

export async function fetchDownloadPlatforms(): Promise<DownloadPlatformView[]> {
  const data = await request<{ platforms: DownloadPlatformView[] }>(
    '/api/admin/downloader/platforms'
  );
  return data.platforms;
}

export async function setDownloadPlatformEnabled(
  id: string,
  enabled: boolean
): Promise<DownloadPlatformView> {
  const data = await request<{ platform: DownloadPlatformView }>(
    `/api/admin/downloader/platforms/${id}`,
    { method: 'PATCH', body: JSON.stringify({ enabled }) }
  );
  return data.platform;
}

export async function fetchDownloaderSettings(): Promise<DownloadSettings> {
  const data = await request<{ settings: DownloadSettings }>('/api/admin/downloader/settings');
  return data.settings;
}

export async function updateDownloaderSettings(
  input: Partial<DownloadSettings>
): Promise<DownloadSettings> {
  const data = await request<{ settings: DownloadSettings }>('/api/admin/downloader/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.settings;
}
