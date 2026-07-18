import { AnalyticsEvent, LinkAnalyticsSummary } from '../entities/analytics-event.entity';

export interface IAnalyticsRepository {
  recordClick(event: Omit<AnalyticsEvent, 'id' | 'clickedAt'>): Promise<AnalyticsEvent>;
  getSummaryForLink(code: string, userId: string): Promise<LinkAnalyticsSummary>;
}
