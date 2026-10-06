/** A single variant value: the rate (units per base) and its quote date. */
export interface RateVariant {
  rate: number;
  date: string | null;
  /** Per-market values when the parallel rate spans more than one market. */
  markets?: Record<string, RateVariant>;
}

export interface RateSnapshot {
  id: string;
  base_currency: string;
  provider_quote_date: string;
  fetched_at: string;
  rates: Record<string, number>;
  metals: Record<string, number>;
  /** Central-bank values by code; `rates` is the fallback. */
  official_rates: Record<string, RateVariant>;
  /** Parallel-market values by code; absent for single-rate currencies. */
  parallel_rates: Record<string, RateVariant>;
}

/** Just the parallel channel of a snapshot, for the last-known lookup (ADR-0014). */
export interface ParallelSnapshot {
  fetched_at: string;
  parallel_rates: Record<string, RateVariant>;
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
  official_rates?: Record<string, RateVariant>;
  parallel_rates?: Record<string, RateVariant>;
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
  /** The parallel channel of every snapshot since `sinceIso`, newest first. */
  getParallelsSince(sinceIso: string): Promise<ParallelSnapshot[]>;
  insertSnapshot(input: InsertSnapshotInput): Promise<RateSnapshot>;
  startSyncRun(provider: string): Promise<string>;
  finishSyncRun(runId: string, input: FinishSyncRunInput): Promise<void>;
  getLastSuccessfulRun(): Promise<RateSyncRun | null>;
}
