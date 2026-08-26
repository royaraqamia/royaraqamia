import type {
  AnalyticsEvent,
  DailyClickStat,
  LinkDeviceBreakdown,
  LinkStatus,
} from '@/shared/contracts/linksnap';
import { request } from '@/frontend/transport/http';

export interface ShortenedLink {
  code: string;
  originalUrl: string;
  createdAt: string;
  isBlocked: boolean;
  expiresAt: string | null;
  status: LinkStatus;
  passwordProtected?: boolean;
}

export interface LinkUpdateBody {
  newCode?: string;
  originalUrl?: string;
  expiresAt?: string | null;
  /** String sets a new password, null clears it, undefined leaves it unchanged. */
  password?: string | null;
}

export interface CodeAvailability {
  code: string;
  available: boolean;
  error?: string;
}

export interface AdminSystemLink {
  code: string;
  originalUrl: string;
  userId: string | null;
  createdAt: string;
  isBlocked: boolean;
  clickCount: number;
}

export interface AdminStats {
  totalLinks: number;
  totalClicks: number;
  blockedLinksCount: number;
  links: AdminSystemLink[];
}

export type RecentClick = Omit<AnalyticsEvent, 'clickedAt'> & { clickedAt: string };

export type AnalyticsRangeFilter = { from?: string; to?: string };

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: RecentClick[];
  clicksByDate: DailyClickStat[];
  topReferrers: { name: string; count: number }[];
  device: LinkDeviceBreakdown;
}

export interface AnalyticsExportRow {
  clickedAt: string;
  referrer: string | null;
  ipCountry: string | null;
  device: string;
  os: string;
  browser: string;
}

export async function listLinks(token: string): Promise<ShortenedLink[]> {
  const data = await request<{ links: ShortenedLink[] }>('/linksnap/api/links', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return data.links || [];
}

export async function shorten(
  originalUrl: string,
  customCode: string | undefined,
  token: string | null,
  password?: string
): Promise<ShortenedLink> {
  const data = await request<{ link: ShortenedLink }>('/linksnap/api/shorten', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({
      originalUrl,
      customCode: customCode || undefined,
      password: password || undefined,
    }),
  });
  return data.link;
}

export async function unlockLink(code: string, password: string): Promise<{ originalUrl: string }> {
  return request<{ originalUrl: string }>('/linksnap/api/unlock', {
    method: 'POST',
    body: JSON.stringify({ code, password }),
  });
}

export async function deleteLink(code: string, token: string): Promise<void> {
  await request(`/linksnap/api/links?code=${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function checkCodeAvailability(
  code: string,
  token: string
): Promise<CodeAvailability> {
  const data = await request<{ availability: CodeAvailability }>(
    `/linksnap/api/availability?code=${encodeURIComponent(code)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.availability;
}

export async function updateLink(
  code: string,
  token: string,
  changes: LinkUpdateBody
): Promise<ShortenedLink> {
  const data = await request<{ link: ShortenedLink }>('/linksnap/api/links', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, ...changes }),
  });
  return data.link;
}

export async function fetchAdminStats(token: string): Promise<AdminStats> {
  const data = await request<{ stats: AdminStats }>('/linksnap/api/admin/stats', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.stats;
}

export async function moderateLink(code: string, isBlocked: boolean, token: string): Promise<void> {
  await request('/linksnap/api/admin/moderate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, isBlocked }),
  });
}

export type BulkLinkActionType = 'delete' | 'setExpiry';

export async function bulkLinkAction(
  token: string,
  action: BulkLinkActionType,
  codes: string[],
  expiresAt?: string | null
): Promise<number> {
  const data = await request<{ affected: number }>('/linksnap/api/links/bulk', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, codes, expiresAt: expiresAt ?? undefined }),
  });
  return data.affected;
}

export async function fetchAnalytics(
  code: string,
  token: string,
  range?: AnalyticsRangeFilter
): Promise<LinkAnalyticsSummary> {
  const query = toRangeQuery(range);
  const data = await request<{ analytics: LinkAnalyticsSummary }>(
    `/linksnap/api/analytics/${encodeURIComponent(code)}${query}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.analytics;
}

export async function exportAnalyticsCsv(
  code: string,
  token: string,
  range?: AnalyticsRangeFilter
): Promise<AnalyticsExportRow[]> {
  const query = toRangeQuery(range);
  const data = await request<{ rows: AnalyticsExportRow[] }>(
    `/linksnap/api/analytics/${encodeURIComponent(code)}/export${query}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.rows || [];
}

function toRangeQuery(range?: AnalyticsRangeFilter): string {
  if (!range) return '';
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
