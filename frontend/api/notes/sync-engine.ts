import { SyncEngine, type SyncEngineDeps } from '@/frontend/shared/local-store/sync-engine';

export type {
  OutboxStore,
  SyncStatus,
  SyncEngineDeps,
} from '@/frontend/shared/local-store/sync-engine';

export const NOTES_SYNC_LOCK = 'notes-sync';
export const NOTES_SYNC_CHANNEL = 'notes-sync';
export const NOTES_SYNCED_MESSAGE = 'notes:synced';

const OPTIONS = {
  lockName: NOTES_SYNC_LOCK,
  channelName: NOTES_SYNC_CHANNEL,
  logLabel: 'Notes',
  syncedMessage: NOTES_SYNCED_MESSAGE,
} as const;

/**
 * Notes' Outbox replayer: the shared engine bound to its lock and channel. The
 * binding lives here rather than in the hook because the worker realm builds the
 * same engine for a background flush (ADR-0058) and must take the same lock and
 * announce on the same channel.
 */
export class NotesSyncEngine extends SyncEngine {
  constructor(deps: SyncEngineDeps) {
    super(deps, OPTIONS);
  }
}
