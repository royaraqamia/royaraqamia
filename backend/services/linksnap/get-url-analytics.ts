import { IAnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { LinkAnalyticsSummary } from '@/shared/contracts/linksnap';

export class GetUrlAnalyticsService {
  constructor(private analyticsRepository: IAnalyticsRepository) {}

  async execute(code: string, userId: string): Promise<LinkAnalyticsSummary> {
    if (!code) {
      throw new Error('Short code is required to retrieve analytics.');
    }
    if (!userId) {
      throw new Error('User authorization is required to view link analytics.');
    }

    return await this.analyticsRepository.getSummaryForLink(code, userId);
  }
}
