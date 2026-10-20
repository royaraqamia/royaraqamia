import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const LINKSNAP_SYNC_LOCK = 'linksnap-sync';
export const LINKSNAP_SYNC_CHANNEL = 'linksnap-sync';
export const LINKSNAP_SYNCED_MESSAGE = 'linksnap:synced';

const OPTIONS = {
  lockName: LINKSNAP_SYNC_LOCK,
  channelName: LINKSNAP_SYNC_CHANNEL,
  logLabel: 'LinkSnap',
  syncedMessage: LINKSNAP_SYNCED_MESSAGE,
} as const;

/**
 * LinkSnap's Outbox replayer: the shared engine bound to its lock and channel.
 * The binding lives here rather than in the hook because the worker realm builds
 * the same engine for a background flush (ADR-0058) and must take the same lock
 * and announce on the same channel.
 */
export class LinksnapSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
