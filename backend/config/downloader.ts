import { getAdminSupabase } from '@/backend/config/supabase';
import { createTurnstileVerifier } from '@/backend/config/turnstile';
import { env } from '@/backend/config/env';
import { createConcurrencyGate, type ConcurrencyGate } from '@/backend/clients/concurrency-gate';
import {
  SupabaseDownloadJobRepository,
  type DownloadJobRepository,
} from '@/backend/repositories/downloader';
import type { MediaProvider } from '@/backend/services/downloader/media-provider';
import { StubMediaProvider } from '@/backend/services/downloader/stub-media-provider';
import { DownloaderService } from '@/backend/services/downloader/downloader-service';

/** Simultaneous provider jobs allowed across the whole site; the TTL reclaims a crashed seat. */
const DOWNLOADER_MAX_CONCURRENT_JOBS = 20;
const DOWNLOADER_JOB_TTL_SECONDS = 15 * 60;

/**
 * Media Downloader composition root. `download_jobs` grants nothing to anon or
 * authenticated, so every path runs on the service role.
 */
export function createDownloadJobRepository(): DownloadJobRepository {
  return new SupabaseDownloadJobRepository(getAdminSupabase());
}

export function createMediaProvider(): MediaProvider {
  // TODO(#151): swap for the Cobalt-backed provider behind the same port.
  return new StubMediaProvider();
}

export function createDownloadCapacity(): ConcurrencyGate {
  return createConcurrencyGate({
    redisUrl: env.upstashRedisUrl,
    redisToken: env.upstashRedisToken,
    limit: DOWNLOADER_MAX_CONCURRENT_JOBS,
    ttlSeconds: DOWNLOADER_JOB_TTL_SECONDS,
  });
}

export function createDownloaderService(): DownloaderService {
  return new DownloaderService(createDownloadJobRepository(), createMediaProvider(), {
    capacity: createDownloadCapacity(),
  });
}

/** Fail-closed on the anonymous create path once `TURNSTILE_SECRET_KEY` is set (ADR-0019). */
export function createDownloaderTurnstileVerifier() {
  return createTurnstileVerifier(env.turnstileSecret);
}
