import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const SYNC_LOCK = 'habitflow-sync';
export const SYNC_CHANNEL = 'habitflow-sync';

const OPTIONS = {
  lockName: SYNC_LOCK,
  channelName: SYNC_CHANNEL,
  logLabel: 'HabitFlow',
  syncedMessage: 'habitflow:synced',
} as const;

/** HabitFlow's Outbox replayer: the shared engine bound to its lock and channel. */
export class HabitSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
