import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const BLOGPRESS_SYNC_LOCK = 'blogpress-sync';
export const BLOGPRESS_SYNC_CHANNEL = 'blogpress-sync';

const OPTIONS = {
  lockName: BLOGPRESS_SYNC_LOCK,
  channelName: BLOGPRESS_SYNC_CHANNEL,
  logLabel: 'BlogPress',
  syncedMessage: 'blogpress:synced',
} as const;

/** BlogPress's Outbox replayer: the shared engine bound to its lock and channel. */
export class BlogpressSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
