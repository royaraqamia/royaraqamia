import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const CHATS_SYNC_LOCK = 'chats-sync';
export const CHATS_SYNC_CHANNEL = 'chats-sync';
export const CHATS_SYNCED_MESSAGE = 'chats:synced';

const OPTIONS = {
  lockName: CHATS_SYNC_LOCK,
  channelName: CHATS_SYNC_CHANNEL,
  logLabel: 'Chats',
  syncedMessage: CHATS_SYNCED_MESSAGE,
} as const;

/**
 * Chats' Outbox replayer: the shared engine bound to its lock and channel, so
 * the list and the open thread (and, later, the shell's background flush) all
 * take the same lock and announce on the same channel (#1033).
 */
export class ChatsSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
