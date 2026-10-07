import { getAdminSupabase } from '@/backend/config/supabase';
import {
  SupabaseDownloadJobRepository,
  type DownloadJobRepository,
} from '@/backend/repositories/downloader';
import type { MediaProvider } from '@/backend/services/downloader/media-provider';
import { StubMediaProvider } from '@/backend/services/downloader/stub-media-provider';
import { DownloaderService } from '@/backend/services/downloader/downloader-service';

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

export function createDownloaderService(): DownloaderService {
  return new DownloaderService(createDownloadJobRepository(), createMediaProvider());
}
