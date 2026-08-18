import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { AnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { ShortLink } from '@/shared/contracts/linksnap';
import { logger } from '@/backend/shared/logger';

export function isReservedShortCode(code: string): boolean {
  return (
    code.startsWith('_') ||
    code.includes('.') ||
    code === 'api' ||
    code === 'favicon.ico' ||
    code === 'unlock'
  );
}

export class ShortLinkRedirectError extends Error {
  constructor(
    message: string,
    public readonly kind: 'not-found' | 'blocked' | 'reserved' | 'expired' | 'password-protected'
  ) {
    super(message);
    this.name = 'ShortLinkRedirectError';
  }
}

export interface LinkClickedNotifier {
  (input: { userId: string; code: string; originalUrl: string }): Promise<void>;
}

export class RedirectUrlService {
  constructor(
    private shortLinkRepository: ShortLinkRepository,
    private analyticsRepository: AnalyticsRepository,
    private readonly notifyLinkClicked?: LinkClickedNotifier
  ) {}

  async execute(
    code: string,
    metadata: {
      referrer: string | null;
      userAgent: string | null;
      ipCountry: string | null;
    }
  ): Promise<string> {
    if (isReservedShortCode(code)) {
      throw new ShortLinkRedirectError('Short link not found.', 'reserved');
    }

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

    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new ShortLinkRedirectError('This short link has expired.', 'expired');
    }

    if (link.passwordHash) {
      throw new ShortLinkRedirectError(
        'This short link is password protected.',
        'password-protected'
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
        logger.error(`Failed to log analytics click for code [${code}]`, { error: String(err) });
      });

    // Fire-and-forget notifying the link owner about the click (if they are
    // signed in). Cooldown/spam control is the caller's responsibility.
    if (link.userId) {
      this.notifyLinkClicked?.({
        userId: link.userId,
        code,
        originalUrl: link.originalUrl,
      }).catch((err) => {
        logger.error(`Failed to notify link owner for code [${code}]`, { error: String(err) });
      });
    }

    return link.originalUrl;
  }
}
