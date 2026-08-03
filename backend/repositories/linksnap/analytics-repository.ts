import { AnalyticsEvent, LinkAnalyticsSummary } from '@/shared/contracts/linksnap';

export interface IAnalyticsRepository {
  recordClick(event: Omit<AnalyticsEvent, 'id' | 'clickedAt'>): Promise<AnalyticsEvent>;
  getLinkOwner(code: string): Promise<string>;
  getSummaryForLink(code: string): Promise<LinkAnalyticsSummary>;
}
