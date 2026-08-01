export interface ShortLink {
  code: string;
  originalUrl: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isBlocked: boolean;
}

export interface AnalyticsEvent {
  id: string;
  linkCode: string;
  clickedAt: Date;
  referrer: string | null;
  userAgent: string | null;
  ipCountry: string | null;
}

export interface DailyClickStat {
  date: string;
  clicks: number;
}

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: AnalyticsEvent[];
  clicksByDate: DailyClickStat[];
  topReferrers: { name: string; count: number }[];
}
