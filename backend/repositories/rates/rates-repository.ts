export interface RateSnapshot {
  id: string;
  base_currency: string;
  provider_quote_date: string;
  fetched_at: string;
  rates: Record<string, number>;
  metals: Record<string, number>;
}

export type RateSyncStatus = 'running' | 'success' | 'failure';

export interface RateSyncRun {
  id: string;
  snapshot_id: string | null;
  status: RateSyncStatus;
  provider: string;
  provider_quote_date: string | null;
  currency_count: number;
  metal_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface InsertSnapshotInput {
  base_currency: string;
  provider_quote_date: string;
  rates: Record<string, number>;
  metals: Record<string, number>;
}

export interface FinishSyncRunInput {
  status: 'success' | 'failure';
  snapshot_id?: string | null;
  provider_quote_date?: string | null;
  currency_count?: number;
  metal_count?: number;
  error?: string | null;
}

export interface RatesRepository {
  getLatestSnapshot(): Promise<RateSnapshot | null>;
  getSnapshotBefore(fetchedAt: string): Promise<RateSnapshot | null>;
  getSnapshotsSince(sinceIso: string): Promise<RateSnapshot[]>;
  insertSnapshot(input: InsertSnapshotInput): Promise<RateSnapshot>;
  startSyncRun(provider: string): Promise<string>;
  finishSyncRun(runId: string, input: FinishSyncRunInput): Promise<void>;
  getLastSuccessfulRun(): Promise<RateSyncRun | null>;
}
