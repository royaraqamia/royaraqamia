import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const QURAN_SYNC_LOCK = 'quran-sync';
export const QURAN_SYNC_CHANNEL = 'quran-sync';
export const QURAN_SYNCED_MESSAGE = 'quran:synced';

const OPTIONS = {
  lockName: QURAN_SYNC_LOCK,
  channelName: QURAN_SYNC_CHANNEL,
  logLabel: 'Quran',
  syncedMessage: QURAN_SYNCED_MESSAGE,
} as const;

/**
 * The Quran Reader's Outbox replayer: the shared engine bound to its lock and
 * channel. The binding lives here rather than in the hook because the worker
 * realm builds the same engine for a background flush (ADR-0058) and must take
 * the same lock and announce on the same channel.
 */
export class QuranSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
