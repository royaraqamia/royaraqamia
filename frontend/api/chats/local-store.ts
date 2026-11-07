import type { ChatConversationSummary, ChatMessage, ChatThread } from '@/shared/contracts/chat';
import { localStoreName, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import {
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import { acquireLocalStore, type LocalStoreLease } from '@/frontend/shared/local-store/connection';
import type { LocalStoreMirror } from '@/frontend/shared/local-store/mirror';
import { createOutboxAccess } from '@/frontend/shared/local-store/outbox-access';
import type { OutboxStore } from '@/frontend/shared/local-store/sync-engine';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';

const PRODUCT = 'chats';
const THREADS_STORE = 'threads';
const MESSAGES_STORE = 'messages';
const META_STORE = 'meta';

/** The list's window: the twenty conversations a member last touched (#1033). */
export const CHAT_THREAD_WINDOW = 20;

/** The thread's window: the newest two hundred lines are what a device keeps. */
export const CHAT_MESSAGE_WINDOW = 200;

/** How long a cached conversation stays on the device (#1033). */
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

/** A thread as the store holds it: the list's row, or the open thread's header. */
export type StoredThread = ChatConversationSummary | ChatThread;

/**
 * Forward-only schema. v1 is what a read keeps: the list's rows and a window of
 * each thread's messages. v2 adds the Outbox, so a line written with no
 * connection lands in the store and its replay intent commits with it — the
 * shape every local-store product uses (#1033). The media blobs join it with the
 * attachment half of the issue.
 */
export const CHATS_STORE_VERSION = 2;

export const chatsStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      const threads = db.createObjectStore(THREADS_STORE, { keyPath: 'id' });
      threads.createIndex('by_activity', 'lastMessageAt');
      const messages = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
      // One cursor per open thread, in the order the thread draws.
      messages.createIndex('by_conversation', ['conversationId', 'createdAt']);
      // The retention sweep walks this one.
      messages.createIndex('by_created', 'createdAt');
      db.createObjectStore(META_STORE, { keyPath: 'key' });
    },
  },
  {
    version: 2,
    migrate: (db) => {
      // `seq` is auto-increment so replay order is the exact write order.
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    },
  },
];

/** What a queued line carries until the server accepts it (#1033). */
export interface ChatSendIntent {
  conversationId: string;
  body: string;
  /** The writer's own id for the line; the server's index makes a replay safe. */
  clientId: string;
  replyToId?: string | null;
}

export interface QueuedMessageInput {
  conversationId: string;
  body: string;
  /** Who is writing. The store's own identity, never a caller's guess. */
  senderId: string;
  clientId?: string;
  replyToId?: string | null;
}

/** What a message's row is doing, as the Outbox knows it. */
export type ChatMessageState = 'queued' | 'failed';

/** Newest activity first: the list's order, and the thread's tiebreaker. */
function activityOf(thread: StoredThread): string {
  return thread.lastMessageAt ?? thread.createdAt;
}

function byActivityDesc(a: StoredThread, b: StoredThread): number {
  return activityOf(b).localeCompare(activityOf(a));
}

function byCreatedAsc(a: ChatMessage, b: ChatMessage): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
}

/**
 * The Chats Local Store: what the list and the open thread paint from when the
 * network has not answered (#1033).
 *
 * One IndexedDB database per identity (`chats__user:<id>`), holding the list's
 * twenty rows and the newest two hundred messages of each thread. It is a cache,
 * not a source of truth: every read writes the server's answer here first, and
 * the next read paints from it before revalidating. Writes enter it through the
 * Outbox in the queue's own change, so nothing here invents a message the server
 * never accepted.
 */
export class ChatsLocalStore {
  private readonly connection: LocalStoreLease;
  private readonly outbox: OutboxStore;
  private readonly mirror: LocalStoreMirror;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    connection: LocalStoreLease,
    readonly identity: LocalIdentity
  ) {
    this.connection = connection;
    this.mirror = connection.mirror;
    this.mirror.declare({ [THREADS_STORE]: 'id' });
    this.outbox = createOutboxAccess(this.connection, () => this.notifyWrites());
  }

  subscribeWrites(listener: () => void): () => void {
    this.writeListeners.add(listener);
    return () => {
      this.writeListeners.delete(listener);
    };
  }

  private notifyWrites(): void {
    for (const listener of this.writeListeners) listener();
  }

  static async open(
    identity: LocalIdentity,
    factory: IDBFactory = globalThis.indexedDB
  ): Promise<ChatsLocalStore> {
    const connection = await acquireLocalStore(
      localStoreName(PRODUCT, identity),
      chatsStoreMigrations,
      factory
    );
    return new ChatsLocalStore(connection, identity);
  }

  /** Closes this holder's lease; the shared connection stays open (#494). */
  close(): void {
    this.connection.close();
  }

  private async readAll<T>(store: string): Promise<T[]> {
    if (this.connection.isClosed) return [];

    // A copy: the mirror's array belongs to every holder, and a caller that
    // sorts its list in place must not reorder the next one.
    const mirrored = this.mirror.read<T>(store);
    if (mirrored) return [...mirrored];

    const rows = await this.connection.run(async (db) => {
      const transaction = db.transaction(store, 'readonly');
      return promisifyRequest(transaction.objectStore(store).getAll() as IDBRequest<T[]>);
    }, []);
    if (!this.connection.isClosed) this.mirror.fill(store, rows);
    return rows;
  }

  private async commit(writes: ReadonlyArray<[store: string, value: unknown]>): Promise<boolean> {
    if (writes.length === 0) return true;

    const stores = [...new Set(writes.map(([store]) => store))];
    const committed = await this.connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const [store, value] of writes) transaction.objectStore(store).put(value);
      await transactionDone(transaction);
      return true;
    }, false);

    if (committed) {
      for (const [store, value] of writes) this.mirror.put(store, value);
      this.notifyWrites();
    }
    return committed;
  }

  /**
   * Commits a write and the intent that replays it atomically (#1033): a crash
   * between the two would either lose the line or send it twice.
   */
  private async commitWithIntent(
    writes: ReadonlyArray<[store: string, value: unknown]>,
    intent: { entity: string; type: string; payload: unknown }
  ): Promise<boolean> {
    const stores = [...new Set([...writes.map(([store]) => store), OUTBOX_STORE])];

    const committed = await this.connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const [store, value] of writes) transaction.objectStore(store).put(value);
      transaction.objectStore(OUTBOX_STORE).put(this.entry(intent));
      await transactionDone(transaction);
      return true;
    }, false);

    if (committed) {
      for (const [store, value] of writes) this.mirror.put(store, value);
      this.notifyWrites();
    }
    return committed;
  }

  private entry(intent: { entity: string; type: string; payload: unknown }): NewOutboxEntry {
    return {
      id: uuidv7(),
      entity: intent.entity,
      type: intent.type,
      payload: intent.payload,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextAttemptAt: 0,
    };
  }

  private async remove(store: string, keys: readonly IDBValidKey[]): Promise<void> {
    if (keys.length === 0) return;

    const removed = await this.connection.run(async (db) => {
      const transaction = db.transaction(store, 'readwrite');
      for (const key of keys) transaction.objectStore(store).delete(key);
      await transactionDone(transaction);
      return true;
    }, false);

    if (removed) {
      // The mirror caches whole stores and has no per-row delete: dropping it
      // costs the next read a re-hydration, which is cheaper than serving a
      // list the sweep already removed a row from.
      this.mirror.drop(store);
      this.notifyWrites();
    }
  }

  // --- Reads ----------------------------------------------------------------

  /** The list's rows, newest activity first. */
  async getThreads(): Promise<StoredThread[]> {
    const rows = await this.readAll<StoredThread>(THREADS_STORE);
    return rows.sort(byActivityDesc).slice(0, CHAT_THREAD_WINDOW);
  }

  /** One thread's header as the last read left it, or null. */
  async getThread(id: string): Promise<ChatThread | null> {
    const row = await this.connection.run(async (db) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(THREADS_STORE).get(id) as IDBRequest<ChatThread | undefined>
      );
    }, undefined);
    return row ?? null;
  }

  /** The newest `CHAT_MESSAGE_WINDOW` messages of a thread, oldest first. */
  async getMessages(
    conversationId: string,
    limit: number = CHAT_MESSAGE_WINDOW
  ): Promise<ChatMessage[]> {
    const rows = await this.connection.run(async (db) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      const index = transaction.objectStore(MESSAGES_STORE).index('by_conversation');
      // A prefix range: every key that starts with the conversation id.
      const range = IDBKeyRange.bound([conversationId], [conversationId, []]);
      return promisifyRequest(index.getAll(range) as IDBRequest<ChatMessage[]>);
    }, []);

    return rows.sort(byCreatedAsc).slice(-limit);
  }

  // --- Writes ---------------------------------------------------------------

  /** Records the list's read, then keeps only the newest window. */
  async saveThreads(threads: readonly StoredThread[]): Promise<void> {
    if (threads.length === 0) return;

    await this.commit(threads.map((thread) => [THREADS_STORE, thread] as [string, unknown]));

    const kept = new Set(
      [...threads]
        .sort(byActivityDesc)
        .slice(0, CHAT_THREAD_WINDOW)
        .map((thread) => thread.id)
    );
    const all = await this.readAll<StoredThread>(THREADS_STORE);
    const dropped = all.filter((thread) => !kept.has(thread.id)).map((thread) => thread.id);
    if (dropped.length > 0) {
      await this.remove(THREADS_STORE, dropped);
      for (const id of dropped) await this.removeConversationMessages(id);
    }
  }

  /** Records the open thread's header — the participant roster and its limits. */
  async saveThread(thread: ChatThread): Promise<void> {
    await this.commit([[THREADS_STORE, thread]]);
  }

  /**
   * Records a server page.
   *
   * `replace` is the first page of a thread: the server's window is the whole
   * cache for it, so what the device held beyond it is dropped rather than
   * growing forever. A scrolled-back page appends instead.
   */
  async saveMessages(
    conversationId: string,
    messages: readonly ChatMessage[],
    options: { replace?: boolean } = {}
  ): Promise<void> {
    if (options.replace) await this.removeConversationMessages(conversationId, messages);
    if (messages.length > 0) {
      await this.commit(messages.map((message) => [MESSAGES_STORE, message] as [string, unknown]));
    }

    const window = await this.getMessages(conversationId, Number.POSITIVE_INFINITY);
    const excess = window.slice(0, Math.max(0, window.length - CHAT_MESSAGE_WINDOW));
    if (excess.length > 0)
      await this.remove(
        MESSAGES_STORE,
        excess.map((row) => row.id)
      );
  }

  /** Records one message — an edit, a tombstone, or the line a send answered. */
  async patchMessage(id: string, patch: Partial<ChatMessage>): Promise<void> {
    const existing = await this.connection.run(async (db) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(MESSAGES_STORE).get(id) as IDBRequest<ChatMessage | undefined>
      );
    }, undefined);
    if (!existing) return;
    await this.commit([[MESSAGES_STORE, { ...existing, ...patch }]]);
  }

  /**
   * A line written now, whether or not the server can take it (#1033).
   *
   * The message and its replay intent commit in one transaction, so the bubble
   * on screen and the queued write cannot disagree. The row is keyed by the
   * client id: the server's own row arrives with a different id and the same
   * `clientId`, and {@link applyServerMessage} swaps it in.
   */
  async enqueueMessage(input: QueuedMessageInput): Promise<ChatMessage> {
    const clientId = input.clientId ?? uuidv7();
    const createdAt = new Date().toISOString();
    const message: ChatMessage = {
      id: clientId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      senderKind: 'user',
      body: input.body,
      replyToId: input.replyToId ?? null,
      editedAt: null,
      deletedAt: null,
      createdAt,
      clientId,
      attachments: [],
      replyTo: null,
    };

    const intent: ChatSendIntent = {
      conversationId: input.conversationId,
      body: input.body,
      clientId,
      replyToId: input.replyToId ?? null,
    };

    await this.commitWithIntent([[MESSAGES_STORE, message]], {
      entity: 'chat_message',
      type: 'message.send',
      payload: intent,
    });

    // The list's preview is the same write seen from the other screen: patching
    // it here keeps the tab honest while the connection is still away.
    const thread = await this.getThread(input.conversationId);
    if (thread) {
      await this.commit([
        [
          THREADS_STORE,
          {
            ...thread,
            lastMessage: {
              body: message.body,
              senderKind: message.senderKind,
              createdAt: message.createdAt,
              hasAttachments: false,
            },
            lastMessageAt: message.createdAt,
          },
        ],
      ]);
    }

    return message;
  }

  /**
   * Swaps the server's row in for the queued copy. Both carry the same
   * `clientId`, so the synthetic bubble the member has been looking at is
   * removed rather than drawn beside its own answer.
   */
  async applyServerMessage(message: ChatMessage): Promise<void> {
    if (message.clientId) {
      const rows = await this.getMessages(message.conversationId, Number.POSITIVE_INFINITY);
      const shadows = rows.filter(
        (row) => row.id !== message.id && row.clientId === message.clientId
      );
      if (shadows.length > 0)
        await this.remove(
          MESSAGES_STORE,
          shadows.map((row) => row.id)
        );
    }

    await this.commit([[MESSAGES_STORE, message]]);

    const thread = await this.getThread(message.conversationId);
    if (thread) {
      await this.commit([
        [
          THREADS_STORE,
          {
            ...thread,
            lastMessage: {
              body: message.body,
              senderKind: message.senderKind,
              createdAt: message.createdAt,
              hasAttachments: message.attachments.length > 0,
            },
            lastMessageAt: message.createdAt,
          },
        ],
      ]);
    }
  }

  /** Every client id with a queued intent, and whether the server refused it. */
  async pendingStates(): Promise<Record<string, ChatMessageState>> {
    const entries = await this.getOutbox();
    const states: Record<string, ChatMessageState> = {};
    for (const entry of entries) {
      if (entry.entity !== 'chat_message') continue;
      const payload = (entry.payload ?? {}) as { clientId?: unknown };
      if (typeof payload.clientId !== 'string') continue;
      states[payload.clientId] = entry.status === 'failed' ? 'failed' : 'queued';
    }
    return states;
  }

  // --- Outbox ---------------------------------------------------------------
  // Data access is shared with the worker realm (`outbox-access.ts`); this store
  // contributes only its write notification.

  getOutbox(): Promise<OutboxEntry[]> {
    return this.outbox.getOutbox();
  }

  removeOutbox(seq: number): Promise<void> {
    return this.outbox.removeOutbox(seq);
  }

  patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    return this.outbox.patchOutbox(seq, patch);
  }

  retryFailedOutbox(): Promise<void> {
    return this.outbox.retryFailedOutbox();
  }

  /** Deletes a thread's cached messages, optionally sparing the incoming page. */
  private async removeConversationMessages(
    conversationId: string,
    keep: readonly ChatMessage[] = []
  ): Promise<void> {
    const kept = new Set(keep.map((message) => message.id));
    const rows = await this.connection.run(async (db) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      const index = transaction.objectStore(MESSAGES_STORE).index('by_conversation');
      const range = IDBKeyRange.bound([conversationId], [conversationId, []]);
      return promisifyRequest(index.getAllKeys(range) as IDBRequest<IDBValidKey[]>);
    }, []);

    const keys = rows.filter((key) => !kept.has(String(key)));
    if (keys.length > 0) await this.remove(MESSAGES_STORE, keys);
  }

  /**
   * The retention sweep (#1033): nothing older than thirty days stays, and a
   * thread whose last line is that old goes with its messages. Run when the
   * store opens, before anything is painted, so a device that sat offline for a
   * month does not resurrect a conversation the member has moved past.
   */
  async prune(now: number = Date.now()): Promise<void> {
    const cutoff = new Date(now - CHAT_RETENTION_MS).toISOString();

    const expired = await this.connection.run(async (db) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
      const index = transaction.objectStore(MESSAGES_STORE).index('by_created');
      const keys: IDBValidKey[] = [];
      await new Promise<void>((resolve, reject) => {
        const request = index.openKeyCursor(IDBKeyRange.upperBound(cutoff));
        request.onerror = () => reject(request.error ?? new Error('chats message sweep failed'));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          keys.push(cursor.primaryKey);
          cursor.continue();
        };
      });
      for (const key of keys) transaction.objectStore(MESSAGES_STORE).delete(key);
      await transactionDone(transaction);
      return keys;
    }, []);

    const threads = await this.readAll<StoredThread>(THREADS_STORE);
    const stale = threads
      .filter((thread) => activityOf(thread) < cutoff)
      .map((thread) => thread.id);
    if (stale.length > 0) {
      await this.remove(THREADS_STORE, stale);
      for (const id of stale) await this.removeConversationMessages(id);
    }
    if (expired.length > 0) this.notifyWrites();
  }

  /** Empties every owned store — the sign-out purge (#1033). */
  async clear(): Promise<void> {
    const stores = [THREADS_STORE, MESSAGES_STORE, OUTBOX_STORE, META_STORE];
    const cleared = await this.connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const store of stores) transaction.objectStore(store).clear();
      await transactionDone(transaction);
      return true;
    }, false);
    if (cleared) {
      for (const store of stores) this.mirror.drop(store);
      this.notifyWrites();
    }
  }
}
