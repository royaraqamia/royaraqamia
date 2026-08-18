export type LinkStatus = 'active' | 'expired' | 'blocked';

export interface ShortLink {
  code: string;
  originalUrl: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isBlocked: boolean;
  expiresAt: Date | null;
  passwordHash: string | null;
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

export interface DeviceStat {
  name: string;
  count: number;
  percent: number;
}

export interface LinkDeviceBreakdown {
  devices: DeviceStat[];
  os: DeviceStat[];
  browsers: DeviceStat[];
}

export interface AnalyticsExportRow {
  clickedAt: string;
  referrer: string | null;
  ipCountry: string | null;
  device: string;
  os: string;
  browser: string;
}

export type BulkLinkAction = 'delete' | 'setExpiry';

export interface BulkLinkActionRequest {
  action: BulkLinkAction;
  codes: string[];
  expiresAt?: string | null;
}

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: AnalyticsEvent[];
  clicksByDate: DailyClickStat[];
  topReferrers: { name: string; count: number }[];
  device: LinkDeviceBreakdown;
}
