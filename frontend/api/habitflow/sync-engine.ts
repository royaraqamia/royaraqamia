import { backoffDelay, isDue, type OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { logger } from '@/frontend/shared/logger';
import {
  classifySyncError,
  errorMessage,
  type SyncTransport,
} from '@/frontend/api/habitflow/sync-transport';

/** The slice of the Local Store the engine needs; kept narrow so it is easy to fake. */
export interface OutboxStore {
  getOutbox(): Promise<OutboxEntry[]>;
  removeOutbox(seq: number): Promise<void>;
  patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void>;
  retryFailedOutbox(): Promise<void>;
}

export interface SyncStatus {
  syncing: boolean;
  pending: number;
  failed: number;
  lastError: string | null;
}

export const SYNC_LOCK = 'habitflow-sync';
export const SYNC_CHANNEL = 'habitflow-sync';

interface SyncEngineDeps {
  store: OutboxStore;
  transport: SyncTransport;
  /** Identity the outbox belongs to; `guest` never flushes (it claims on sign-in). */
  isSignedIn: () => boolean;
  isOnline?: () => boolean;
  now?: () => number;
  random?: () => number;
  onStatus?: (status: SyncStatus) => void;
  /** Wakes other tabs after a flush so they refresh their view. */
  broadcast?: (message: { type: string }) => void;
}

/**
 * Replays the Outbox to the server (ADR-0029): exactly one flush leader across
 * tabs (Web Locks), exponential backoff with jitter on transient failure,
 * permanent failures kept and surfaced rather than dropped. Order is preserved
 * per flush — a transient failure stops the run so a later write can never
 * overtake an earlier one.
 */
export class HabitSyncEngine {
  private syncing = false;
  private lastError: string | null = null;
  private listeners: Array<(status: SyncStatus) => void> = [];

  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly deps: SyncEngineDeps) {
    this.isOnline = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  async status(): Promise<SyncStatus> {
    const entries = await this.deps.store.getOutbox();
    return {
      syncing: this.syncing,
      pending: entries.filter((e) => e.status === 'pending').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      lastError: this.lastError,
    };
  }

  private async emit(): Promise<void> {
    const status = await this.status();
    this.deps.onStatus?.(status);
    for (const listener of this.listeners) listener(status);
  }

  private async setSyncing(value: boolean): Promise<void> {
    this.syncing = value;
    await this.emit();
  }

  /** Replays the due intents, if this tab wins the leader lock. */
  async flush(): Promise<void> {
    if (this.syncing) return;
    if (!this.deps.isSignedIn()) return;
    if (!this.isOnline()) {
      await this.emit();
      return;
    }

    const locks = globalThis.navigator?.locks;
    if (locks) {
      await locks.request(SYNC_LOCK, async () => this.run());
    } else {
      await this.run();
    }
  }

  private async run(): Promise<void> {
    await this.setSyncing(true);
    try {
      const due = (await this.deps.store.getOutbox()).filter((entry) => isDue(entry, this.now()));

      for (const entry of due) {
        if (!this.isOnline()) break;
        try {
          await this.deps.transport.send(entry);
          await this.deps.store.removeOutbox(entry.seq);
          this.lastError = null;
        } catch (error) {
          const message = errorMessage(error);
          if (classifySyncError(error) === 'permanent') {
            // Surface and move on: one bad intent must not block the rest.
            this.lastError = message;
            await this.deps.store.patchOutbox(entry.seq, { status: 'failed', lastError: message });
            logger.warn('HabitFlow outbox intent failed permanently', {
              type: entry.type,
              message,
            });
            continue;
          }
          // Transient: back off and stop, preserving replay order.
          const attempts = entry.attempts + 1;
          this.lastError = message;
          await this.deps.store.patchOutbox(entry.seq, {
            attempts,
            lastError: message,
            nextAttemptAt: this.now() + backoffDelay(attempts, this.random),
          });
          break;
        }
      }
    } finally {
      await this.setSyncing(false);
      this.deps.broadcast?.({ type: 'habitflow:synced' });
    }
  }

  /** Manual retry: re-arm every failed intent, then flush. */
  async retry(): Promise<void> {
    await this.deps.store.retryFailedOutbox();
    this.lastError = null;
    await this.flush();
  }
}
