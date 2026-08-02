import { AnalyticsEvent, LinkAnalyticsSummary } from '@/shared/contracts/linksnap';

export interface IAnalyticsRepository {
  recordClick(event: Omit<AnalyticsEvent, 'id' | 'clickedAt'>): Promise<AnalyticsEvent>;
  getSummaryForLink(code: string, userId: string): Promise<LinkAnalyticsSummary>;
}
