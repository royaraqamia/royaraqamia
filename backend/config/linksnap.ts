import { SupabaseShortLinkRepository } from '@/backend/repositories/linksnap/supabase-short-link';
import { SupabaseAnalyticsRepository } from '@/backend/repositories/linksnap/supabase-analytics';
import { SupabaseAdminRepository } from '@/backend/repositories/linksnap/supabase-admin';
import { ShortenUrlService } from '@/backend/services/linksnap/shorten-url';
import { ListLinksService } from '@/backend/services/linksnap/list-links';
import { UpdateLinkService } from '@/backend/services/linksnap/update-link';
import { CheckCodeAvailabilityService } from '@/backend/services/linksnap/check-code-availability';
import { DeleteLinkService } from '@/backend/services/linksnap/delete-link';
import { BulkLinkActionService } from '@/backend/services/linksnap/bulk-link-action';
import { ModerateLinkService } from '@/backend/services/linksnap/moderate-link';
import { GetUrlAnalyticsService } from '@/backend/services/linksnap/get-url-analytics';
import { GetSystemStatsService } from '@/backend/services/linksnap/get-system-stats';
import { UnlockLinkService } from '@/backend/services/linksnap/unlock-link';
import {
  RedirectUrlService,
  type LinkClickedNotifier,
} from '@/backend/services/linksnap/redirect-url';
import { getAdminSupabase, getPublicSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { env } from '@/backend/config/env';

/**
 * Linksnap composition root — central wiring for repositories and
 * services used by the API route handlers.
 */
export function createShortLinkRepository(): SupabaseShortLinkRepository {
  return new SupabaseShortLinkRepository(getAdminSupabase(), getPublicSupabase());
}

export function createAnalyticsRepository(): SupabaseAnalyticsRepository {
  return new SupabaseAnalyticsRepository(getAdminSupabase());
}

export function createAdminRepository(): SupabaseAdminRepository {
  return new SupabaseAdminRepository(getAdminSupabase());
}

export function createShortenUrlService(): ShortenUrlService {
  return new ShortenUrlService(createShortLinkRepository());
}

export function createListLinksService(): ListLinksService {
  return new ListLinksService(createShortLinkRepository());
}

export function createUpdateLinkService(): UpdateLinkService {
  return new UpdateLinkService(createShortLinkRepository());
}

export function createCheckCodeAvailabilityService(): CheckCodeAvailabilityService {
  return new CheckCodeAvailabilityService(createShortLinkRepository());
}

export function createDeleteLinkService(): DeleteLinkService {
  return new DeleteLinkService(createShortLinkRepository());
}

export function createBulkLinkActionService(): BulkLinkActionService {
  return new BulkLinkActionService(createShortLinkRepository());
}

export function createModerateLinkService(): ModerateLinkService {
  return new ModerateLinkService(createShortLinkRepository(), env.adminEmails);
}

export function createGetUrlAnalyticsService(): GetUrlAnalyticsService {
  return new GetUrlAnalyticsService(createAnalyticsRepository());
}

export function createGetSystemStatsService(): GetSystemStatsService {
  return new GetSystemStatsService(createAdminRepository(), env.adminEmails);
}

export function createRedirectUrlService(): RedirectUrlService {
  return new RedirectUrlService(
    createShortLinkRepository(),
    createAnalyticsRepository(),
    createLinkClickedNotifier()
  );
}

export function createUnlockLinkService(): UnlockLinkService {
  return new UnlockLinkService(
    createShortLinkRepository(),
    createAnalyticsRepository(),
    createLinkClickedNotifier()
  );
}

const LINK_CLICK_NOTIFY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Notifies the link owner about a click, throttled to one notification per
 * link per 30 minutes to avoid spam. Fail-open: if the limiter is unreachable
 * the click notification still goes out.
 */
export function createLinkClickedNotifier(): LinkClickedNotifier {
  const notify = createAdminNotificationProducer();
  return async ({ userId, code, originalUrl }) => {
    const allowed = await checkRateLimit(
      `linksnap:click-notify:${userId}:${code}`,
      1,
      LINK_CLICK_NOTIFY_WINDOW_MS,
      {
        failClosed: false,
      }
    );
    if (!allowed) return;
    await notify({
      user_id: userId,
      type: 'link_clicked',
      title: 'تم النقر على رابطك',
      body: `تم فتح رابطك القصير /${code} لمرة جديدة.`,
      metadata: { code, originalUrl },
    });
  };
}
