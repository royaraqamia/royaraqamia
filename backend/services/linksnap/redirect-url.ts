import { IShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { IAnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { ShortLink } from '@/shared/contracts/linksnap';

export function isReservedShortCode(code: string): boolean {
  return code.startsWith('_') || code.includes('.') || code === 'api' || code === 'favicon.ico';
}

export class ShortLinkRedirectError extends Error {
  constructor(
    message: string,
    public readonly kind: 'not-found' | 'blocked'
  ) {
    super(message);
    this.name = 'ShortLinkRedirectError';
  }
}

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
      throw new ShortLinkRedirectError('Short link not found.', 'not-found');
    }

    if (link.isBlocked) {
      throw new ShortLinkRedirectError(
        'This link has been deactivated due to terms of service violations.',
        'blocked'
      );
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
