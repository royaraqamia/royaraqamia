import { SupabaseShortLinkRepository } from '@/backend/repositories/linksnap/supabase-short-link';
import { SupabaseAnalyticsRepository } from '@/backend/repositories/linksnap/supabase-analytics';
import { SupabaseAdminRepository } from '@/backend/repositories/linksnap/supabase-admin';
import { ShortenUrlService } from '@/backend/services/linksnap/shorten-url';
import { BulkShortenService } from '@/backend/services/linksnap/bulk-shorten';
import { ListLinksService } from '@/backend/services/linksnap/list-links';
import { UpdateLinkService } from '@/backend/services/linksnap/update-link';
import { DeleteLinkService } from '@/backend/services/linksnap/delete-link';
import { ModerateLinkService } from '@/backend/services/linksnap/moderate-link';
import { GetUrlAnalyticsService } from '@/backend/services/linksnap/get-url-analytics';
import { GetSystemStatsService } from '@/backend/services/linksnap/get-system-stats';
import { RedirectUrlService } from '@/backend/services/linksnap/redirect-url';
import { env } from '@/backend/config/env';

/**
 * Linksnap composition root — central wiring for repositories and
 * services used by the API route handlers.
 */
export function createShortLinkRepository(): SupabaseShortLinkRepository {
  return new SupabaseShortLinkRepository();
}

export function createAnalyticsRepository(): SupabaseAnalyticsRepository {
  return new SupabaseAnalyticsRepository();
}

export function createAdminRepository(): SupabaseAdminRepository {
  return new SupabaseAdminRepository();
}

export function createShortenUrlService(): ShortenUrlService {
  return new ShortenUrlService(createShortLinkRepository());
}

export function createBulkShortenService(): BulkShortenService {
  return new BulkShortenService(createShortLinkRepository());
}

export function createListLinksService(): ListLinksService {
  return new ListLinksService(createShortLinkRepository());
}

export function createUpdateLinkService(): UpdateLinkService {
  return new UpdateLinkService(createShortLinkRepository());
}

export function createDeleteLinkService(): DeleteLinkService {
  return new DeleteLinkService(createShortLinkRepository());
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
  return new RedirectUrlService(createShortLinkRepository(), createAnalyticsRepository());
}
