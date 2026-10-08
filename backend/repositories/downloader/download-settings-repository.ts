import type { DownloadSettings } from '@/shared/contracts/downloader';

/**
 * The only code that knows the `downloader_settings` table. `get` returns the live
 * caps row, or `null` when it is absent so the caller can fall back to
 * `DEFAULT_DOWNLOAD_SETTINGS`; `save` rewrites the single row.
 */
export interface DownloadSettingsRepository {
  get(): Promise<DownloadSettings | null>;
  save(settings: DownloadSettings): Promise<void>;
}
