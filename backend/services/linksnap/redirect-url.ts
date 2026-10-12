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

/**
 * Every code that can exist is either generated from the alphanumeric alphabet
 * (`CodeGenerator`) or a custom code sanitized to `[a-zA-Z0-9_-]` at creation.
 * Anything outside that alphabet cannot resolve, so it is rejected before the
 * database lookup. Without this, scanner traffic (`/wp-admin`, `/env`, random
 * words) buys a Supabase round-trip and then a 302 into a full `/linksnap`
 * render — both function CPU from requests no user ever made.
 */
const SHORT_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Executes work after the response without awaiting it on the request path. */
export type DeferredWork = (promise: Promise<unknown>) => void;

/** Default: fire and forget. Fluid compute may cut an instance as soon as the
 * response is sent, so the route passes `after()` here to keep it alive until
 * the write settles instead of silently losing clicks. */
const fireAndForget: DeferredWork = (promise) => void promise;

export class ShortLinkRedirectError extends Error {
  constructor(
    message: string,
    public readonly kind:
      'not-found' | 'invalid' | 'blocked' | 'reserved' | 'expired' | 'password-protected'
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
    private readonly notifyLinkClicked?: LinkClickedNotifier,
    private readonly defer: DeferredWork = fireAndForget
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

    if (!SHORT_CODE_PATTERN.test(code)) {
      throw new ShortLinkRedirectError('Short link not found.', 'invalid');
    }

    const link: ShortLink | null = await this.shortLinkRepository.findByCode(code);

    if (!link) {
      throw new ShortLinkRedirectError('Short link not found.', 'not-found');
    }

    // A tombstoned link is deleted; its code must stop resolving (ADR-0029).
    if (link.deletedAt) {
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

    // Click analytics are off the redirect's critical path; `defer` keeps the
    // instance alive for the write (`after()` on the route) or falls back to
    // fire-and-forget in tests.
    this.defer(
      this.analyticsRepository
        .recordClick({
          linkCode: code,
          referrer: metadata.referrer,
          userAgent: metadata.userAgent,
          ipCountry: metadata.ipCountry,
        })
        .catch((err) => {
          logger.error(`Failed to log analytics click for code [${code}]`, { error: String(err) });
        })
    );

    // Fire-and-forget notifying the link owner about the click (if they are
    // signed in). Cooldown/spam control is the caller's responsibility.
    if (link.userId && this.notifyLinkClicked) {
      this.defer(
        this.notifyLinkClicked({
          userId: link.userId,
          code,
          originalUrl: link.originalUrl,
        }).catch((err) => {
          logger.error(`Failed to notify link owner for code [${code}]`, { error: String(err) });
        })
      );
    }

    return link.originalUrl;
  }
}
