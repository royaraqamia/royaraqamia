import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { DownloadBlockKind, DownloadBlocklistEntry } from '@/shared/contracts/downloader';
import type {
  AddDownloadBlockCommand,
  DownloadBlocklistRepository,
} from '@/backend/repositories/downloader/download-blocklist-repository';

type BlocklistRow = Database['public']['Tables']['downloader_blocklist']['Row'];

function toEntry(row: BlocklistRow): DownloadBlocklistEntry {
  return {
    id: row.id,
    kind: row.kind as DownloadBlockKind,
    value: row.value,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export class SupabaseDownloadBlocklistRepository implements DownloadBlocklistRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async list(): Promise<DownloadBlocklistEntry[]> {
    const { data, error } = await this.supabase
      .from('downloader_blocklist')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toEntry);
  }

  async add(input: AddDownloadBlockCommand): Promise<DownloadBlocklistEntry> {
    const { data, error } = await this.supabase
      .from('downloader_blocklist')
      .insert({ kind: input.kind, value: input.value, created_by: input.createdBy })
      .select('*')
      .single();

    if (error) throw error;
    return toEntry(data);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from('downloader_blocklist').delete().eq('id', id);
    if (error) throw error;
  }
}
