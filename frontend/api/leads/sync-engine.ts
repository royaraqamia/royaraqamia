import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const LEADS_SYNC_LOCK = 'leads-sync';
export const LEADS_SYNC_CHANNEL = 'leads-sync';
export const LEADS_SYNCED_MESSAGE = 'leads:synced';

const OPTIONS = {
  lockName: LEADS_SYNC_LOCK,
  channelName: LEADS_SYNC_CHANNEL,
  logLabel: 'LeadOutbox',
  syncedMessage: LEADS_SYNCED_MESSAGE,
} as const;

/**
 * The LeadOutbox replayer: the shared engine bound to its lock and channel. The
 * binding lives here rather than in the hook because the worker realm builds the
 * same engine for a background flush (ADR-0058) and must take the same lock and
 * announce on the same channel.
 */
export class LeadsSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
