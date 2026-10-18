import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const SPENDTRACK_SYNC_LOCK = 'spendtrack-sync';
export const SPENDTRACK_SYNC_CHANNEL = 'spendtrack-sync';
export const SPENDTRACK_SYNCED_MESSAGE = 'spendtrack:synced';

const OPTIONS = {
  lockName: SPENDTRACK_SYNC_LOCK,
  channelName: SPENDTRACK_SYNC_CHANNEL,
  logLabel: 'SpendTrack',
  syncedMessage: SPENDTRACK_SYNCED_MESSAGE,
} as const;

/**
 * SpendTrack's Outbox replayer: the shared engine bound to its lock and
 * channel. The binding lives here rather than in the hook because the worker
 * realm builds the same engine for a background flush (ADR-0058) and must take
 * the same lock and announce on the same channel.
 */
export class SpendtrackSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
