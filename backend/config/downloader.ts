import * as Sentry from '@sentry/nextjs';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createTurnstileVerifier } from '@/backend/config/turnstile';
import { env } from '@/backend/config/env';
import { CobaltMediaProvider } from '@/backend/clients/cobalt-media-provider';
import {
  SupabaseDownloadBlocklistRepository,
  SupabaseDownloadJobRepository,
  SupabaseDownloadPlatformRepository,
  SupabaseDownloadSettingsRepository,
  type DownloadBlocklistRepository,
  type DownloadJobRepository,
  type DownloadPlatformRepository,
  type DownloadSettingsRepository,
} from '@/backend/repositories/downloader';
import type { MediaProvider } from '@/backend/services/downloader/media-provider';
import { StubMediaProvider } from '@/backend/services/downloader/stub-media-provider';
import {
  DownloaderService,
  type PlatformBreakerPolicy,
} from '@/backend/services/downloader/downloader-service';
import { DownloaderAdminService } from '@/backend/services/downloader/downloader-admin-service';

/** Consecutive provider failures before a Platform's breaker opens, and its cooldown. */
const DOWNLOADER_PLATFORM_FAILURE_THRESHOLD = 5;
const DOWNLOADER_PLATFORM_COOLDOWN_MS = 15 * 60 * 1000;

const platformBreakerPolicy: PlatformBreakerPolicy = {
  failureThreshold: DOWNLOADER_PLATFORM_FAILURE_THRESHOLD,
  cooldownMs: DOWNLOADER_PLATFORM_COOLDOWN_MS,
};

/**
 * Media Downloader composition root. `download_jobs`, `downloader_platforms`,
 * `downloader_blocklist` and `downloader_settings` grant nothing to anon or
 * authenticated, so every path runs on the service role.
 */
export function createDownloadJobRepository(): DownloadJobRepository {
  return new SupabaseDownloadJobRepository(getAdminSupabase());
}

/** Per-Platform allowlist overrides and breaker state (ADR-0020). */
export function createDownloadPlatformRepository(): DownloadPlatformRepository {
  return new SupabaseDownloadPlatformRepository(getAdminSupabase());
}

/** The Admin's domain/URL blocklist. */
export function createDownloadBlocklistRepository(): DownloadBlocklistRepository {
  return new SupabaseDownloadBlocklistRepository(getAdminSupabase());
}

/** The Admin-tunable caps, read on every dispatch and result. */
export function createDownloadSettingsRepository(): DownloadSettingsRepository {
  return new SupabaseDownloadSettingsRepository(getAdminSupabase());
}

export function downloaderCallbackUrl(): string {
  return `${env.siteUrl.replace(/\/$/, '')}/api/downloader/callback`;
}

/**
 * The real Cobalt host once `DOWNLOADER_PROVIDER_URL` is configured (ADR-0017);
 * until then the stub stands in, reporting back through the same signed callback
 * route so the out-of-band path is exercised end to end.
 */
export function createMediaProvider(): MediaProvider {
  const url = env.downloaderProviderUrl;
  if (url) {
    return new CobaltMediaProvider({ url, token: env.downloaderProviderToken });
  }
  return new StubMediaProvider({
    callbackUrl: downloaderCallbackUrl(),
    callbackSecret: env.downloaderCallbackSecret,
  });
}

export function createDownloaderService(): DownloaderService {
  return new DownloaderService(createDownloadJobRepository(), createMediaProvider(), {
    callbackUrl: downloaderCallbackUrl(),
    platforms: createDownloadPlatformRepository(),
    breaker: platformBreakerPolicy,
    settings: createDownloadSettingsRepository(),
    blocklist: createDownloadBlocklistRepository(),
    onBreakerTrip: (trip) => {
      Sentry.captureMessage(`Media Downloader: ${trip.platform} circuit breaker opened`, {
        level: 'warning',
        extra: {
          platform: trip.platform,
          failures: trip.failures,
          openUntil: trip.openUntil,
        },
      });
    },
  });
}

/** The Admin Console's read/write view over the same repositories the service enforces. */
export function createDownloaderAdminService(): DownloaderAdminService {
  return new DownloaderAdminService(
    createDownloadJobRepository(),
    createDownloadBlocklistRepository(),
    createDownloadPlatformRepository(),
    createDownloadSettingsRepository()
  );
}

/** Fail-closed on the anonymous create path once `TURNSTILE_SECRET_KEY` is set (ADR-0019). */
export function createDownloaderTurnstileVerifier() {
  return createTurnstileVerifier(env.turnstileSecret);
}
