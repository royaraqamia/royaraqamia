// Domain Entity for a Link Click Analytics Event
export interface AnalyticsEvent {
  id: string; // Unique UUID of the event
  linkCode: string; // Code of the link that was clicked
  clickedAt: Date; // Timestamp of the click
  referrer: string | null; // Document referrer if available
  userAgent: string | null; // Browser user agent
  ipCountry: string | null; // Location indicator (e.g. ISO code)
}

export interface AnalyticsEventInput {
  linkCode: string;
  referrer: string | null;
  userAgent: string | null;
  ipCountry: string | null;
}

export interface DailyClickStat {
  date: string; // ISO format date 'YYYY-MM-DD'
  clicks: number;
}

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: AnalyticsEvent[];
  clicksByDate: DailyClickStat[];
  topReferrers: { name: string; count: number }[];
}
