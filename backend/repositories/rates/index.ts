import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, Tables } from '@/backend/models/database.types';
import type {
  FinishSyncRunInput,
  InsertSnapshotInput,
  RatesRepository,
  RateSnapshot,
  RateSyncRun,
  RateSyncStatus,
} from '@/backend/repositories/rates/rates-repository';

type SnapshotRow = Tables<'rate_snapshots'>;
type SyncRunRow = Tables<'rate_sync_runs'>;

function toNumberRecord(value: Json): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

function mapSnapshot(row: SnapshotRow): RateSnapshot {
  return {
    id: row.id,
    base_currency: row.base_currency,
    provider_quote_date: row.provider_quote_date,
    fetched_at: row.fetched_at,
    rates: toNumberRecord(row.rates),
    metals: toNumberRecord(row.metals),
  };
}

function mapSyncRun(row: SyncRunRow): RateSyncRun {
  return {
    id: row.id,
    snapshot_id: row.snapshot_id,
    status: row.status as RateSyncStatus,
    provider: row.provider,
    provider_quote_date: row.provider_quote_date,
    currency_count: row.currency_count,
    metal_count: row.metal_count,
    error: row.error,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

export function createRatesRepository(supabase: SupabaseClient<Database>): RatesRepository {
  return {
    async getLatestSnapshot(): Promise<RateSnapshot | null> {
      const { data, error } = await supabase
        .from('rate_snapshots')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapSnapshot(data) : null;
    },

    async getSnapshotBefore(fetchedAt: string): Promise<RateSnapshot | null> {
      const { data, error } = await supabase
        .from('rate_snapshots')
        .select('*')
        .lt('fetched_at', fetchedAt)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapSnapshot(data) : null;
    },

    async getSnapshotsSince(sinceIso: string): Promise<RateSnapshot[]> {
      const { data, error } = await supabase
        .from('rate_snapshots')
        .select('*')
        .gte('fetched_at', sinceIso)
        .order('fetched_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapSnapshot);
    },

    async insertSnapshot(input: InsertSnapshotInput): Promise<RateSnapshot> {
      const { data, error } = await supabase
        .from('rate_snapshots')
        .insert({
          base_currency: input.base_currency,
          provider_quote_date: input.provider_quote_date,
          rates: input.rates as Json,
          metals: input.metals as Json,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return mapSnapshot(data);
    },

    async startSyncRun(provider: string): Promise<string> {
      const { data, error } = await supabase
        .from('rate_sync_runs')
        .insert({ provider, status: 'running' })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    },

    async finishSyncRun(runId: string, input: FinishSyncRunInput): Promise<void> {
      const { error } = await supabase
        .from('rate_sync_runs')
        .update({
          status: input.status,
          snapshot_id: input.snapshot_id ?? null,
          provider_quote_date: input.provider_quote_date ?? null,
          currency_count: input.currency_count ?? 0,
          metal_count: input.metal_count ?? 0,
          error: input.error ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
      if (error) throw new Error(error.message);
    },

    async getLastSuccessfulRun(): Promise<RateSyncRun | null> {
      const { data, error } = await supabase
        .from('rate_sync_runs')
        .select('*')
        .eq('status', 'success')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapSyncRun(data) : null;
    },
  };
}
