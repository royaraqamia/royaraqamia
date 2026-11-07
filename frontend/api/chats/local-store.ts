import type {
  ChatAttachment,
  ChatAttachmentInput,
  ChatConversationSummary,
  ChatMessage,
  ChatThread,
} from '@/shared/contracts/chat';
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
/**
 * The open thread's header, kept apart from the list's rows: a summary and a
 * full thread share an id but not a shape, and painting one as the other is a
 * crash (the thread draws `participants`, which a summary does not carry).
 */
const HEADERS_STORE = 'headers';
const MESSAGES_STORE = 'messages';
/** Attachment bytes: what a queued line will upload, and what a read keeps. */
const MEDIA_STORE = 'media';
const META_STORE = 'meta';

/** The list's window: the twenty conversations a member last touched (#1033). */
export const CHAT_THREAD_WINDOW = 20;

/** The thread's window: the newest two hundred lines are what a device keeps. */
export const CHAT_MESSAGE_WINDOW = 200;

/** How long a cached conversation stays on the device (#1033). */
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

/** What one account's attachments may cost on the device: 250 MB (#1033). */
export const CHAT_MEDIA_BUDGET_BYTES = 250 * 1024 * 1024;

/** The prefix a queued line's attachment ids carry until the server answers. */
export const LOCAL_ATTACHMENT_PREFIX = 'local:';

/** A thread as the store holds it: the list's row, or the open thread's header. */
export type StoredThread = ChatConversationSummary | ChatThread;

/**
 * Forward-only schema. v1 is what a read keeps: the list's rows and a window of
 * each thread's messages. v2 adds the Outbox, so a line written with no
 * connection lands in the store and its replay intent commits with it — the
 * shape every local-store product uses (#1033). v3 keeps the thread's header in
 * its own store: v1 and v2 wrote the list's summaries and the open thread's
 * header into the same object store, and a cached summary drawn as a thread is
 * a missing `participants` (#1120's first production report). v4 adds the media
 * store: the attachment bytes a queued line owns, and the bytes a read keeps
 * under the account's 250 MB.
 */
export const CHATS_STORE_VERSION = 4;

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
  {
    version: 3,
    migrate: (db) => {
      // A fresh store: whatever v2 left in `threads` is a list row, not a
      // header, so nothing is carried over.
      db.createObjectStore(HEADERS_STORE, { keyPath: 'id' });
    },
  },
  {
    version: 4,
    migrate: (db) => {
      const media = db.createObjectStore(MEDIA_STORE, { keyPath: 'key' });
      // The budget sweep walks this one; reading touches it for LRU eviction.
      media.createIndex('by_last_used', 'lastUsedAt');
      media.createIndex('by_stored', 'storedAt');
    },
  },
];

/**
 * One attachment a queued line still owes the bucket (#1033). The bytes live
 * in the media store under `key`; `uploaded` is the object the server accepted,
 * recorded so a replay after a partial upload does not send a second copy.
 */
export interface ChatSendAttachment {
  key: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploaded?: ChatAttachmentInput;
}

/** What a queued line carries until the server accepts it (#1033). */
export interface ChatSendIntent {
  conversationId: string;
  body: string;
  /** The writer's own id for the line; the server's index makes a replay safe. */
  clientId: string;
  replyToId?: string | null;
  attachments?: ChatSendAttachment[];
}

/** One file the composer is holding: its bytes and the name they go up under. */
export interface QueuedAttachmentInput {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface QueuedMessageInput {
  conversationId: string;
  body: string;
  /** Who is writing. The store's own identity, never a caller's guess. */
  senderId: string;
  clientId?: string;
  replyToId?: string | null;
  attachments?: readonly QueuedAttachmentInput[];
}

/** A media row: the bytes, what they are called, and when they were last used. */
export interface StoredMedia {
  key: string;
  /** The line that owns the bytes while they are still queued. */
  clientId: string | null;
  conversationId: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  blob: Blob;
  /** `outbox` is owed to the server; `attachment` is a copy kept for reading. */
  kind: 'outbox' | 'attachment';
  /** Present once the bucket has accepted the object. */
  storagePath?: string;
  storedAt: number;
  lastUsedAt: number;
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

/** The media key of a queued line's attachment: stable across retries. */
export function outboxMediaKey(clientId: string, index: number): string {
  return `out:${clientId}:${index}`;
}

/** The media key behind a queued bubble's attachment id, or null for a server row. */
export function localAttachmentMediaKey(attachmentId: string): string | null {
  return attachmentId.startsWith(LOCAL_ATTACHMENT_PREFIX)
    ? attachmentId.slice(LOCAL_ATTACHMENT_PREFIX.length)
    : null;
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

  /**
   * One thread's header as the last open left it, or null. Never a list row:
   * a summary has no `participants`, and drawing it as a thread crashes.
   */
  async getThread(id: string): Promise<ChatThread | null> {
    const row = await this.connection.run(async (db) => {
      const transaction = db.transaction(HEADERS_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(HEADERS_STORE).get(id) as IDBRequest<ChatThread | undefined>
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
    await this.commit([[HEADERS_STORE, thread]]);
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
    const now = Date.now();

    // The bytes are written with the line, not after it: an attachment the
    // member picked is exactly as durable as the sentence typed beside it.
    const media = (input.attachments ?? []).map((file, index) => {
      const key = outboxMediaKey(clientId, index);
      const row: StoredMedia = {
        key,
        clientId,
        conversationId: input.conversationId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        bytes: file.blob.size,
        blob: file.blob,
        kind: 'outbox',
        storedAt: now,
        lastUsedAt: now,
      };
      return { key, file, row };
    });

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
      attachments: media.map(({ key, file }): ChatAttachment => ({
        id: `${LOCAL_ATTACHMENT_PREFIX}${key}`,
        fileName: file.fileName,
        mimeType: file.mimeType,
        byteSize: file.blob.size,
      })),
      replyTo: null,
    };

    const intent: ChatSendIntent = {
      conversationId: input.conversationId,
      body: input.body,
      clientId,
      replyToId: input.replyToId ?? null,
      ...(media.length > 0
        ? {
            attachments: media.map(({ key, file }): ChatSendAttachment => ({
              key,
              fileName: file.fileName,
              mimeType: file.mimeType,
              byteSize: file.blob.size,
            })),
          }
        : {}),
    };

    await this.commitWithIntent(
      [
        [MESSAGES_STORE, message],
        ...media.map(({ row }) => [MEDIA_STORE, row] as [string, unknown]),
      ],
      {
        entity: 'chat_message',
        type: 'message.send',
        payload: intent,
      }
    );

    if (media.length > 0) await this.enforceMediaBudget();
    await this.patchPreview(input.conversationId, message);
    return message;
  }

  // --- Media ----------------------------------------------------------------

  /** One attachment's bytes as the device holds them, or null. Reading is a use. */
  async getMedia(key: string, now: number = Date.now()): Promise<Blob | null> {
    const row = await this.readMedia(key);
    if (!row) return null;

    // A quiet write: reading a file must not wake the queue's subscribers or
    // make a flush look like the member wrote something. A failed timestamp is
    // not a failed read — the bytes are what was asked for.
    try {
      await this.connection.run(async (db) => {
        const transaction = db.transaction(MEDIA_STORE, 'readwrite');
        transaction.objectStore(MEDIA_STORE).put({ ...row, lastUsedAt: now });
        await transactionDone(transaction);
        return true;
      }, false);
    } catch {
      // Eviction falls back to the timestamp it already had.
    }
    return row.blob;
  }

  /** Records a copy of attachment bytes, then keeps the account inside its budget. */
  async saveMedia(media: StoredMedia, options: { budget?: number } = {}): Promise<void> {
    await this.commit([[MEDIA_STORE, media]]);
    await this.enforceMediaBudget(new Set([media.key]), options.budget);
  }

  /** What every attachment on this device costs together. */
  async mediaUsageBytes(): Promise<number> {
    const rows = await this.readAllMedia();
    return rows.reduce((sum, row) => sum + row.bytes, 0);
  }

  /**
   * Records that the bucket accepted one of a queued line's files, on the
   * intent itself: a retry after a partial upload sends the object once, not
   * twice, and the bytes stay until the message lands.
   */
  async recordAttachmentUpload(
    seq: number,
    key: string,
    uploaded: ChatAttachmentInput
  ): Promise<void> {
    const entry = (await this.getOutbox()).find((row) => row.seq === seq);
    if (!entry) return;

    const payload = (entry.payload ?? {}) as ChatSendIntent;
    const attachments = (payload.attachments ?? []).map((attachment) =>
      attachment.key === key ? { ...attachment, uploaded } : attachment
    );
    await this.patchOutbox(seq, { payload: { ...payload, attachments } });

    const row = await this.readMedia(key);
    if (row) await this.commit([[MEDIA_STORE, { ...row, storagePath: uploaded.storagePath }]]);
  }

  /** Drops the bytes of a line the server has now taken. */
  private async dropMediaForClient(clientId: string): Promise<void> {
    const rows = await this.readAllMedia();
    const owned = rows
      .filter((row) => row.clientId === clientId && row.kind === 'outbox')
      .map((row) => row.key);
    await this.remove(MEDIA_STORE, owned);
  }

  /**
   * The 250 MB wall (#1033): oldest use first, and never the file a queued line
   * has not uploaded yet — evicting that would turn a budget into a lost write.
   */
  private async enforceMediaBudget(
    keep: ReadonlySet<string> = new Set(),
    budget: number = CHAT_MEDIA_BUDGET_BYTES
  ): Promise<number> {
    const rows = await this.readAllMedia();
    let usage = rows.reduce((sum, row) => sum + row.bytes, 0);
    if (usage <= budget) return 0;

    const protectedKeys = new Set([...keep, ...(await this.pendingMediaKeys())]);
    const candidates = rows
      .filter((row) => !protectedKeys.has(row.key))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.key.localeCompare(b.key));

    const dropped: string[] = [];
    for (const candidate of candidates) {
      if (usage <= budget) break;
      dropped.push(candidate.key);
      usage -= candidate.bytes;
    }
    if (dropped.length > 0) await this.remove(MEDIA_STORE, dropped);
    return dropped.length;
  }

  /** Media keys a queued line has not uploaded yet. */
  private async pendingMediaKeys(): Promise<Set<string>> {
    const keys = new Set<string>();
    for (const entry of await this.getOutbox()) {
      if (entry.entity !== 'chat_message') continue;
      const attachments = ((entry.payload ?? {}) as ChatSendIntent).attachments ?? [];
      for (const attachment of attachments) {
        if (!attachment.uploaded) keys.add(attachment.key);
      }
    }
    return keys;
  }

  private readMedia(key: string): Promise<StoredMedia | undefined> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(MEDIA_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(MEDIA_STORE).get(key) as IDBRequest<StoredMedia | undefined>
      );
    }, undefined);
  }

  private readAllMedia(): Promise<StoredMedia[]> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(MEDIA_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(MEDIA_STORE).getAll() as IDBRequest<StoredMedia[]>
      );
    }, []);
  }

  /**
   * The list's preview moves with a line the thread wrote. It patches the
   * cached summary — never the header, which its own read keeps — so the list
   * and the open thread cannot disagree about what was last said.
   */
  private async patchPreview(conversationId: string, message: ChatMessage): Promise<void> {
    const row = await this.connection.run(async (db) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      return promisifyRequest(
        transaction.objectStore(THREADS_STORE).get(conversationId) as IDBRequest<
          ChatConversationSummary | undefined
        >
      );
    }, undefined);
    if (!row) return;

    await this.commit([
      [
        THREADS_STORE,
        {
          ...row,
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
    await this.patchPreview(message.conversationId, message);
    // The server has the bytes now; the device keeps only what a read still
    // needs, not the copy that was waiting for the post.
    if (message.clientId) await this.dropMediaForClient(message.clientId);
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
      await this.remove(HEADERS_STORE, stale);
      for (const id of stale) await this.removeConversationMessages(id);
    }

    // Attachment bytes follow the same clock, except the ones a queued line has
    // not uploaded: a file that waited longer than the cache window is still the
    // member's write, not an expired copy.
    const pending = await this.pendingMediaKeys();
    const media = await this.readAllMedia();
    const staleMedia = media
      .filter((row) => row.storedAt < now - CHAT_RETENTION_MS && !pending.has(row.key))
      .map((row) => row.key);
    if (staleMedia.length > 0) await this.remove(MEDIA_STORE, staleMedia);
    await this.enforceMediaBudget();

    if (expired.length > 0) this.notifyWrites();
  }

  /** Empties every owned store — the sign-out purge (#1033). */
  async clear(): Promise<void> {
    const stores = [
      THREADS_STORE,
      HEADERS_STORE,
      MESSAGES_STORE,
      MEDIA_STORE,
      OUTBOX_STORE,
      META_STORE,
    ];
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
