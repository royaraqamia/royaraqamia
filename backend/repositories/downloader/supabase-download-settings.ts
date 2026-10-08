import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { DownloadSettings } from '@/shared/contracts/downloader';
import type { DownloadSettingsRepository } from '@/backend/repositories/downloader/download-settings-repository';

type SettingsRow = Database['public']['Tables']['downloader_settings']['Row'];

function toSettings(row: SettingsRow): DownloadSettings {
  return {
    maxDurationSeconds: row.max_duration_seconds,
    maxAudioBytes: row.max_audio_bytes,
    maxVideoBytes: row.max_video_bytes,
    maxConcurrentJobs: row.max_concurrent_jobs,
    linkTtlSeconds: row.link_ttl_seconds,
  };
}

export class SupabaseDownloadSettingsRepository implements DownloadSettingsRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async get(): Promise<DownloadSettings | null> {
    const { data, error } = await this.supabase
      .from('downloader_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();

    if (error) throw error;
    return data ? toSettings(data) : null;
  }

  async save(settings: DownloadSettings): Promise<void> {
    const { error } = await this.supabase.from('downloader_settings').upsert({
      id: true,
      max_duration_seconds: settings.maxDurationSeconds,
      max_audio_bytes: settings.maxAudioBytes,
      max_video_bytes: settings.maxVideoBytes,
      max_concurrent_jobs: settings.maxConcurrentJobs,
      link_ttl_seconds: settings.linkTtlSeconds,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
  }
}
