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

export interface RecentClick {
  id: string;
  linkCode: string;
  clickedAt: string;
  referrer: string | null;
  userAgent: string | null;
  ipCountry: string | null;
}

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: RecentClick[];
  clicksByDate: { date: string; clicks: number }[];
  topReferrers: { name: string; count: number }[];
}

export interface BulkShortenResultItem {
  originalUrl: string;
  shortLink?: { code: string };
  error?: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  url: string,
  options: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export class LinksnapApiClient {
  static async listLinks(token: string): Promise<ShortenedLink[]> {
    const data = await request<{ links: ShortenedLink[] }>('/linksnap/api/links', { token });
    return data.links || [];
  }

  static async shorten(
    originalUrl: string,
    customCode: string | undefined,
    token: string | null
  ): Promise<ShortenedLink> {
    const data = await request<{ link: ShortenedLink }>('/linksnap/api/shorten', {
      method: 'POST',
      token,
      body: { originalUrl, customCode: customCode || undefined },
    });
    return data.link;
  }

  static async shortenBulk(urls: string[], token: string | null): Promise<BulkShortenResultItem[]> {
    const data = await request<{ results: BulkShortenResultItem[] }>('/linksnap/api/shorten/bulk', {
      method: 'POST',
      token,
      body: { urls },
    });
    return data.results || [];
  }

  static async deleteLink(code: string, token: string): Promise<void> {
    await request(`/linksnap/api/links?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
      token,
    });
  }

  static async updateLink(
    code: string,
    originalUrl: string,
    token: string
  ): Promise<ShortenedLink> {
    const data = await request<{ link: ShortenedLink }>('/linksnap/api/links', {
      method: 'PATCH',
      token,
      body: { code, originalUrl },
    });
    return data.link;
  }

  static async fetchAdminStats(token: string): Promise<AdminStats> {
    const data = await request<{ stats: AdminStats }>('/linksnap/api/admin/stats', { token });
    return data.stats;
  }

  static async moderateLink(code: string, isBlocked: boolean, token: string): Promise<void> {
    await request('/linksnap/api/admin/moderate', {
      method: 'POST',
      token,
      body: { code, isBlocked },
    });
  }

  static async fetchAnalytics(code: string, token: string): Promise<LinkAnalyticsSummary> {
    const data = await request<{ analytics: LinkAnalyticsSummary }>(
      `/linksnap/api/analytics/${encodeURIComponent(code)}`,
      { token }
    );
    return data.analytics;
  }
}
