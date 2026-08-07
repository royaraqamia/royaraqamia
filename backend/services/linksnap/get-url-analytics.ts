import {
  AnalyticsRepository,
  AnalyticsDateRange,
} from '@/backend/repositories/linksnap/analytics-repository';
import { LinkAnalyticsSummary, AnalyticsExportRow } from '@/shared/contracts/linksnap';
import { AppError } from '@/backend/shared/errors';
import { parseUserAgent } from '@/backend/services/linksnap/user-agent-parser';

export class GetUrlAnalyticsService {
  constructor(private analyticsRepository: AnalyticsRepository) {}

  private async assertOwner(code: string, userId: string): Promise<void> {
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
  }

  async execute(
    code: string,
    userId: string,
    range?: AnalyticsDateRange
  ): Promise<LinkAnalyticsSummary> {
    await this.assertOwner(code, userId);
    return await this.analyticsRepository.getSummaryForLink(code, range);
  }

  async exportCsv(
    code: string,
    userId: string,
    range?: AnalyticsDateRange
  ): Promise<AnalyticsExportRow[]> {
    await this.assertOwner(code, userId);

    const events = await this.analyticsRepository.getExportEvents(code, range);
    return events.map((event) => {
      const info = parseUserAgent(event.userAgent);
      return {
        clickedAt: event.clickedAt.toISOString(),
        referrer: event.referrer,
        ipCountry: event.ipCountry,
        device: info.deviceType,
        os: info.os.name,
        browser: info.browser.name,
      };
    });
  }
}
