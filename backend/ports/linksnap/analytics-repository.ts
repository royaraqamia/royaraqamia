import { AnalyticsEvent, LinkAnalyticsSummary } from '@/backend/models/linksnap/analytics-event';

export interface IAnalyticsRepository {
  recordClick(event: Omit<AnalyticsEvent, 'id' | 'clickedAt'>): Promise<AnalyticsEvent>;
  getSummaryForLink(code: string, userId: string): Promise<LinkAnalyticsSummary>;
}
