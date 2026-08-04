import { IAnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { LinkAnalyticsSummary } from '@/shared/contracts/linksnap';
import { AppError } from '@/backend/shared/errors';

export class GetUrlAnalyticsService {
  constructor(private analyticsRepository: IAnalyticsRepository) {}

  async execute(code: string, userId: string): Promise<LinkAnalyticsSummary> {
    if (!code) {
      throw new AppError('رمز الرابط مطلوب.', 400);
    }
    if (!userId) {
      throw new Error('User authorization is required to view link analytics.');
    }

    const ownerId = await this.analyticsRepository.getLinkOwner(code);
    if (ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this link.');
    }

    return await this.analyticsRepository.getSummaryForLink(code);
  }
}
