import { IAnalyticsRepository } from '../../domain/interfaces/analytics-repository.interface';
import { LinkAnalyticsSummary } from '../../domain/entities/analytics-event.entity';

export class GetUrlAnalyticsUseCase {
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
