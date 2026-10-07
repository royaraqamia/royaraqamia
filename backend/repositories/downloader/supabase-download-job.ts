import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { DownloadFormat, DownloadJob, DownloadStatus } from '@/shared/contracts/downloader';
import type {
  CreateDownloadJobCommand,
  DownloadJobRepository,
  DownloadJobUpdate,
} from '@/backend/repositories/downloader/download-job-repository';

type DownloadJobRow = Database['public']['Tables']['download_jobs']['Row'];

function toDownloadJob(row: DownloadJobRow): DownloadJob {
  const hasFile = Boolean(row.file_url && row.file_filename && row.file_expires_at);
  return {
    id: row.id,
    sourceUrl: row.source_url,
    format: row.format as DownloadFormat,
    status: row.status as DownloadStatus,
    platform: row.platform,
    error: row.error,
    file: hasFile
      ? {
          url: row.file_url as string,
          filename: row.file_filename as string,
          sizeBytes: row.file_size_bytes ?? 0,
          expiresAt: row.file_expires_at as string,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseDownloadJobRepository implements DownloadJobRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateDownloadJobCommand): Promise<DownloadJob> {
    const { data, error } = await this.supabase
      .from('download_jobs')
      .insert({ source_url: input.url, format: input.format })
      .select('*')
      .single();

    if (error) throw error;
    await this.recordEvent(data.id, data.status);
    return toDownloadJob(data);
  }

  async findById(id: string): Promise<DownloadJob | null> {
    const { data, error } = await this.supabase
      .from('download_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? toDownloadJob(data) : null;
  }

  async countActive(): Promise<number> {
    const { count, error } = await this.supabase
      .from('download_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running');

    if (error) throw error;
    return count ?? 0;
  }

  async updateStatus(id: string, patch: DownloadJobUpdate): Promise<DownloadJob> {
    const clearFile = patch.file === null;
    const { data, error } = await this.supabase
      .from('download_jobs')
      .update({
        status: patch.status,
        platform: patch.platform ?? undefined,
        error: patch.error ?? undefined,
        file_url: clearFile ? null : (patch.file?.url ?? undefined),
        file_filename: clearFile ? null : (patch.file?.filename ?? undefined),
        file_size_bytes: clearFile ? null : (patch.file?.sizeBytes ?? undefined),
        file_expires_at: clearFile ? null : (patch.file?.expiresAt ?? undefined),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    await this.recordEvent(id, patch.status);
    return toDownloadJob(data);
  }

  private async recordEvent(jobId: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('download_job_events')
      .insert({ job_id: jobId, status });

    if (error) throw error;
  }
}
