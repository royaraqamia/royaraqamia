import { getAdminSupabase } from '@/backend/config/supabase';
import { createTurnstileVerifier } from '@/backend/config/turnstile';
import { env } from '@/backend/config/env';
import { CobaltMediaProvider } from '@/backend/clients/cobalt-media-provider';
import {
  SupabaseDownloadJobRepository,
  type DownloadJobRepository,
} from '@/backend/repositories/downloader';
import type { MediaProvider } from '@/backend/services/downloader/media-provider';
import { StubMediaProvider } from '@/backend/services/downloader/stub-media-provider';
import { DownloaderService } from '@/backend/services/downloader/downloader-service';

/** Jobs the provider may work on at once; the stale sweep reclaims a lost callback (#155). */
const DOWNLOADER_MAX_CONCURRENT_JOBS = 20;

/**
 * Media Downloader composition root. `download_jobs` grants nothing to anon or
 * authenticated, so every path runs on the service role.
 */
export function createDownloadJobRepository(): DownloadJobRepository {
  return new SupabaseDownloadJobRepository(getAdminSupabase());
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
    capacityLimit: DOWNLOADER_MAX_CONCURRENT_JOBS,
    callbackUrl: downloaderCallbackUrl(),
  });
}

/** Fail-closed on the anonymous create path once `TURNSTILE_SECRET_KEY` is set (ADR-0019). */
export function createDownloaderTurnstileVerifier() {
  return createTurnstileVerifier(env.turnstileSecret);
}
