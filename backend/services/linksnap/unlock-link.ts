import { ShortLinkRepository } from '@/backend/repositories/linksnap/short-link-repository';
import { AnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { ShortLinkRedirectError } from '@/backend/services/linksnap/redirect-url';
import { verifyPassword } from '@/backend/shared/password-hash';
import { AppError } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import type { LinkClickedNotifier } from '@/backend/services/linksnap/redirect-url';

export class UnlockLinkService {
  constructor(
    private shortLinkRepository: ShortLinkRepository,
    private analyticsRepository: AnalyticsRepository,
    private readonly notifyLinkClicked?: LinkClickedNotifier
  ) {}

  /**
   * Verifies the password of a protected short link. On success it records the
   * click (the request that actually reaches the destination) and returns the
   * original URL so the caller can redirect.
   */
  async execute(
    code: string,
    password: string,
    metadata: { referrer: string | null; userAgent: string | null; ipCountry: string | null }
  ): Promise<string> {
    const link = await this.shortLinkRepository.findByCode(code);
    if (!link) {
      throw new ShortLinkRedirectError('Short link not found.', 'not-found');
    }
    if (!link.passwordHash) {
      throw new AppError('هذا الرابط ليس محمياً بكلمة مرور.', 400);
    }
    if (!verifyPassword(password, link.passwordHash)) {
      throw new AppError('كلمة المرور غير صحيحة.', 401);
    }

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
