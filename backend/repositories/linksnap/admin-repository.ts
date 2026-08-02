export interface SystemStatsReportData {
  totalLinks: number;
  totalClicks: number;
  blockedLinksCount: number;
  links: Array<{
    code: string;
    originalUrl: string;
    userId: string | null;
    createdAt: string;
    isBlocked: boolean;
    clickCount: number;
  }>;
}

export interface IAdminRepository {
  getSystemStats(): Promise<SystemStatsReportData>;
}
