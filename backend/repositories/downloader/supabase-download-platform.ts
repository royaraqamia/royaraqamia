import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  DownloadPlatformPatch,
  DownloadPlatformRepository,
  DownloadPlatformState,
} from '@/backend/repositories/downloader/download-platform-repository';

type PlatformRow = Database['public']['Tables']['downloader_platforms']['Row'];
type PlatformUpsert = Database['public']['Tables']['downloader_platforms']['Insert'];

function toState(row: PlatformRow): DownloadPlatformState {
  return {
    platform: row.platform,
    enabled: row.enabled,
    consecutiveFailures: row.consecutive_failures,
    openUntil: row.open_until,
    lastFailureAt: row.last_failure_at,
  };
}

export class SupabaseDownloadPlatformRepository implements DownloadPlatformRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async get(platform: string): Promise<DownloadPlatformState | null> {
    const { data, error } = await this.supabase
      .from('downloader_platforms')
      .select('*')
      .eq('platform', platform)
      .maybeSingle();

    if (error) throw error;
    return data ? toState(data) : null;
  }

  async save(platform: string, patch: DownloadPlatformPatch): Promise<void> {
    const row: PlatformUpsert = { platform, updated_at: new Date().toISOString() };
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.consecutiveFailures !== undefined) {
      row.consecutive_failures = patch.consecutiveFailures;
    }
    if (patch.openUntil !== undefined) row.open_until = patch.openUntil;
    if (patch.lastFailureAt !== undefined) row.last_failure_at = patch.lastFailureAt;

    const { error } = await this.supabase
      .from('downloader_platforms')
      .upsert(row, { onConflict: 'platform' });

    if (error) throw error;
  }
}
