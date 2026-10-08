/**
 * Runtime state for one Platform's allowlist entry: the Admin override of its
 * enabled flag and its circuit-breaker counters. The catalogue (which Platforms
 * exist and their defaults) lives in code; only what changes at runtime is here.
 */
export interface DownloadPlatformState {
  platform: string;
  /** Admin override; `null` means "use the catalogue default". */
  enabled: boolean | null;
  /** Consecutive extraction failures; reset on a success. */
  consecutiveFailures: number;
  /** When the breaker is open, the moment it closes; `null` when closed. */
  openUntil: string | null;
  lastFailureAt: string | null;
}

export type DownloadPlatformPatch = Partial<Omit<DownloadPlatformState, 'platform'>>;

/**
 * The only code that knows the `downloader_platforms` table. The service owns the
 * breaker policy (thresholds, cooldowns); this port only reads and writes state.
 */
export interface DownloadPlatformRepository {
  get(platform: string): Promise<DownloadPlatformState | null>;
  save(platform: string, patch: DownloadPlatformPatch): Promise<void>;
}
