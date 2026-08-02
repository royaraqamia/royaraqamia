import { IShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { IAnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { ShortLink } from '@/shared/contracts/linksnap';

export class RedirectUrlService {
  constructor(
    private shortLinkRepository: IShortLinkRepository,
    private analyticsRepository: IAnalyticsRepository
  ) {}

  async execute(
    code: string,
    metadata: {
      referrer: string | null;
      userAgent: string | null;
      ipCountry: string | null;
    }
  ): Promise<string> {
    const link: ShortLink | null = await this.shortLinkRepository.findByCode(code);

    if (!link) {
      throw new Error('Short link not found.');
    }

    if (link.isBlocked) {
      throw new Error('This link has been deactivated due to terms of service violations.');
    }

    // Fire-and-forget logging click analytics to keep redirect under 100ms
    this.analyticsRepository
      .recordClick({
        linkCode: code,
        referrer: metadata.referrer,
        userAgent: metadata.userAgent,
        ipCountry: metadata.ipCountry,
      })
      .catch((err) => {
        console.error(`Failed to log analytics click for code [${code}]:`, err);
      });

    return link.originalUrl;
  }
}
