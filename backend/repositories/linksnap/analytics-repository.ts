import { AnalyticsEvent, LinkAnalyticsSummary } from '@/shared/contracts/linksnap';

export interface AnalyticsDateRange {
  from?: Date;
  to?: Date;
}

export interface AnalyticsRepository {
  recordClick(event: Omit<AnalyticsEvent, 'id' | 'clickedAt'>): Promise<AnalyticsEvent>;
  getLinkOwner(code: string): Promise<string>;
  getSummaryForLink(code: string, range?: AnalyticsDateRange): Promise<LinkAnalyticsSummary>;
  getExportEvents(code: string, range?: AnalyticsDateRange): Promise<AnalyticsEvent[]>;
}