import { backoffDelay, isDue, type OutboxEntry } from '@/frontend/shared/local-store/outbox';
import { logger } from '@/frontend/shared/logger';
import {
  classifySyncError,
  errorMessage,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

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
  /** The Outbox intent type of the last permanent failure, e.g. `expense.update`. */
  lastFailedType: string | null;
}

export interface SyncEngineOptions {
  /** Web Locks name: exactly one tab across the origin flushes at a time. */
  lockName: string;
  /** BroadcastChannel the engine owns: opened on first use, closed by `dispose()`. */
  channelName: string;
  /** Human label for log lines, e.g. `HabitFlow`. */
  logLabel: string;
  /** Message broadcast to sibling tabs after a flush. */
  syncedMessage: string;
}

export interface SyncEngineDeps {
  store: OutboxStore;
  transport: SyncTransport;
  /** Identity the outbox belongs to; `guest` never flushes (it claims on sign-in). */
  isSignedIn: () => boolean;
  isOnline?: () => boolean;
  now?: () => number;
  random?: () => number;
  onStatus?: (status: SyncStatus) => void;
}

/**
 * Replays an Outbox to the server (ADR-0029): exactly one flush leader across
 * tabs (Web Locks), exponential backoff with jitter on transient failure,
 * permanent failures kept and surfaced rather than dropped. Order is preserved
 * per flush — a transient failure stops the run so a later write can never
 * overtake an earlier one.
 *
 * Product-agnostic: the transport knows the endpoints, the options name the
 * lock/channel. HabitFlow and SpendTrack each wrap this with their own.
 *
 * The engine also owns its BroadcastChannel: it opens one from `channelName`
 * on first use, announces a completed flush on it, and closes it in `dispose()`.
 * Owning it here (rather than each hook wiring `broadcast` by hand) is what
 * lets `dispose()` drop the reference so a flush that lands after teardown
 * cannot post to a closed channel (#200).
 */
export class SyncEngine {
  private syncing = false;
  private lastError: string | null = null;
  private lastFailedType: string | null = null;
  private listeners: Array<(status: SyncStatus) => void> = [];

  /** Opened on first broadcast or `onSync`; `disposed` keeps it shut for good. */
  private channel: BroadcastChannel | null = null;
  private channelOpened = false;
  private disposed = false;
  /** Run when a sibling tab announces a completed flush. */
  private syncListeners: Array<() => void> = [];

  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    private readonly deps: SyncEngineDeps,
    private readonly options: SyncEngineOptions
  ) {
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

  /**
   * Registers a callback for a sibling tab's completed flush (so this tab can
   * refresh). Opening the channel is what makes the engine reachable; `dispose`
   * unregisters and silences it. Returns an unsubscribe.
   */
  onSync(listener: () => void): () => void {
    this.syncListeners.push(listener);
    this.openChannel();
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Closes the owned channel and drops its reference. A flush still in flight
   * when the owner unmounts then skips its broadcast instead of posting to a
   * closed channel (which throws `InvalidStateError`); safe to call twice.
   */
  dispose(): void {
    this.disposed = true;
    this.channel?.close();
    this.channel = null;
    this.syncListeners = [];
  }

  private openChannel(): BroadcastChannel | null {
    if (this.channelOpened || this.disposed) return this.channel;
    this.channelOpened = true;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(this.options.channelName);
      this.channel.onmessage = (event) => {
        if ((event.data as { type?: string } | null)?.type !== this.options.syncedMessage) return;
        for (const listener of this.syncListeners) listener();
      };
    }
    return this.channel;
  }

  private broadcastSynced(): void {
    this.openChannel()?.postMessage({ type: this.options.syncedMessage });
  }

  async status(): Promise<SyncStatus> {
    const entries = await this.deps.store.getOutbox();
    return {
      syncing: this.syncing,
      pending: entries.filter((e) => e.status === 'pending').length,
      failed: entries.filter((e) => e.status === 'failed').length,
      lastError: this.lastError,
      lastFailedType: this.lastFailedType,
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
      await locks.request(this.options.lockName, async () => this.run());
    } else {
      await this.run();
    }
  }

  private async run(): Promise<void> {
    await this.setSyncing(true);
    try {
      for (const entry of await this.deps.store.getOutbox()) {
        if (entry.status === 'failed') continue; // surfaced, never dropped
        if (!isDue(entry, this.now())) break; // ordered barrier: do not overtake
        if (!this.isOnline()) break;
        try {
          await this.deps.transport.send(entry);
          await this.deps.store.removeOutbox(entry.seq);
          this.lastError = null;
          this.lastFailedType = null;
        } catch (error) {
          const message = errorMessage(error);
          if (classifySyncError(error) === 'permanent') {
            // Surface and move on: one bad intent must not block the rest.
            this.lastError = message;
            this.lastFailedType = entry.type;
            await this.deps.store.patchOutbox(entry.seq, { status: 'failed', lastError: message });
            logger.warn(`${this.options.logLabel} outbox intent failed permanently`, {
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
      this.broadcastSynced();
    }
  }

  /** Manual retry: re-arm every failed intent, then flush. */
  async retry(): Promise<void> {
    await this.deps.store.retryFailedOutbox();
    this.lastError = null;
    this.lastFailedType = null;
    await this.flush();
  }
}
