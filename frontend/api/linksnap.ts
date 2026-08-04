import type { AnalyticsEvent, DailyClickStat } from '@/shared/contracts/linksnap';
import { request } from '@/frontend/transport/http';

export interface ShortenedLink {
  code: string;
  originalUrl: string;
  createdAt: string;
  isBlocked: boolean;
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

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: RecentClick[];
  clicksByDate: DailyClickStat[];
  topReferrers: { name: string; count: number }[];
}

export interface BulkShortenResultItem {
  originalUrl: string;
  shortLink?: { code: string };
  error?: string;
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
  token: string | null
): Promise<ShortenedLink> {
  const data = await request<{ link: ShortenedLink }>('/linksnap/api/shorten', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ originalUrl, customCode: customCode || undefined }),
  });
  return data.link;
}

export async function shortenBulk(urls: string[], token: string | null): Promise<BulkShortenResultItem[]> {
  const data = await request<{ results: BulkShortenResultItem[] }>('/linksnap/api/shorten/bulk', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ urls }),
  });
  return data.results || [];
}

export async function deleteLink(code: string, token: string): Promise<void> {
  await request(`/linksnap/api/links?code=${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateLink(
  code: string,
  originalUrl: string,
  token: string
): Promise<ShortenedLink> {
  const data = await request<{ link: ShortenedLink }>('/linksnap/api/links', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, originalUrl }),
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

export async function fetchAnalytics(code: string, token: string): Promise<LinkAnalyticsSummary> {
  const data = await request<{ analytics: LinkAnalyticsSummary }>(
    `/linksnap/api/analytics/${encodeURIComponent(code)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data.analytics;
}
