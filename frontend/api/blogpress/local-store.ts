import type { Post, PostStatus } from '@/shared/contracts/blogpress';
import { localStoreName, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import {
  openLocalStore,
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';
import { LocalStoreConnection } from '@/frontend/shared/local-store/connection';
import { uuidv7 } from '@/frontend/shared/local-store/uuid';
import {
  OUTBOX_STORE,
  type NewOutboxEntry,
  type OutboxEntry,
} from '@/frontend/shared/local-store/outbox';

const PRODUCT = 'blogpress';
const DRAFTS_STORE = 'drafts';
const MEDIA_STORE = 'media';

/** A durable write-intent paired with the mutation that produced it. */
interface OutboxIntent {
  entity: string;
  type: string;
  payload: unknown;
}

/**
 * A draft attachment whose bytes live in the Local Store before they ever reach
 * the network (ADR-0028): a draft is never blocked on an upload. `placeholder`
 * is what the draft body references until the Sync Engine swaps in `url`.
 */
export interface BlogpressMedia {
  id: string;
  postId: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  status: 'pending' | 'uploaded';
  url: string | null;
}

/** The prefix a draft body uses to reference a not-yet-uploaded blob. */
export const MEDIA_PLACEHOLDER_PREFIX = 'blogpress-media:';

export function mediaPlaceholder(id: string): string {
  return `${MEDIA_PLACEHOLDER_PREFIX}${id}`;
}

/** Every `blogpress-media:<id>` reference in a markdown body, in order. */
export function mediaPlaceholderIds(content: string): string[] {
  const ids: string[] = [];
  const pattern = new RegExp(`${MEDIA_PLACEHOLDER_PREFIX}([0-9a-fA-F-]{36})`, 'g');
  for (const match of content.matchAll(pattern)) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
}

/**
 * The local shape of a BlogPress draft. Keyed by the client-minted id so the
 * device can reference a draft before any server has seen it (ADR-0029);
 * `clientId` mirrors it for the server's `(author_id, client_id)` upsert, and
 * `isNew` marks a draft that has never been confirmed by the server.
 */
export interface BlogpressDraft {
  id: string;
  clientId: string;
  slug: string;
  content: string;
  status: PostStatus;
  coverImage: string;
  metaTitle: string;
  metaDesc: string;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  isNew: boolean;
  deletedAt: string | null;
}

export interface DraftSaveInput {
  id: string;
  clientId?: string;
  slug: string;
  content: string;
  coverImage: string;
  metaTitle: string;
  metaDesc: string;
  status?: PostStatus;
  publishAt?: string | null;
  isNew?: boolean;
}

/**
 * Forward-only schema. v1 is the rendered drafts; v2 adds the Outbox so a write
 * and its replay-intent commit atomically; v3 adds the attachment blobs.
 */
export const BLOGPRESS_STORE_VERSION = 3;

export const blogpressStoreMigrations: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      const drafts = db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
      drafts.createIndex('by_updated_at', 'updatedAt');
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
      const media = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      media.createIndex('by_post', 'postId');
    },
  },
];

/**
 * The Local Store for BlogPress: the source of truth the editor renders from,
 * one IndexedDB database per identity (`blogpress__guest`, `blogpress__user:<id>`).
 * Every mutation lands here and enqueues an Outbox intent in the same
 * transaction; the Sync Engine replays those intents to the server (ADR-0027).
 */
export class BlogpressLocalStore {
  private readonly connection: LocalStoreConnection;
  private readonly writeListeners = new Set<() => void>();

  private constructor(
    db: IDBDatabase,
    readonly identity: LocalIdentity
  ) {
    this.connection = new LocalStoreConnection(db);
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
  ): Promise<BlogpressLocalStore> {
    const db = await openLocalStore(
      localStoreName(PRODUCT, identity),
      blogpressStoreMigrations,
      factory
    );
    return new BlogpressLocalStore(db, identity);
  }

  /**
   * Closes the connection: work already in flight settles first, and every
   * operation after this one resolves without touching IndexedDB (#204).
   */
  close(): void {
    this.connection.close();
  }

  private async readAll<T>(store: string): Promise<T[]> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(store, 'readonly');
      return promisifyRequest(transaction.objectStore(store).getAll() as IDBRequest<T[]>);
    }, []);
  }

  private async getOne<T>(store: string, key: IDBValidKey): Promise<T | null> {
    return this.connection.run(async (db) => {
      const transaction = db.transaction(store, 'readonly');
      const value = await promisifyRequest(
        transaction.objectStore(store).get(key) as IDBRequest<T | undefined>
      );
      return value ?? null;
    }, null);
  }

  /**
   * Commits record writes and, when present, the Outbox intent atomically.
   *
   * Returns false when the store is closing and nothing was written (#204), so a
   * caller that must not run a follow-up it cannot undo can check first.
   */
  private async commit(
    writes: ReadonlyArray<[store: string, value: unknown]>,
    intent?: OutboxIntent
  ): Promise<boolean> {
    if (writes.length === 0 && !intent) return true;

    const stores = writes.map(([store]) => store);
    if (intent) stores.push(OUTBOX_STORE);

    const committed = await this.connection.run(async (db) => {
      const transaction = db.transaction(stores, 'readwrite');
      for (const [store, value] of writes) {
        transaction.objectStore(store).put(value);
      }
      if (intent) {
        transaction.objectStore(OUTBOX_STORE).put(this.entry(intent));
      }
      await transactionDone(transaction);
      return true;
    }, false);
    if (committed) this.notifyWrites();
    return committed;
  }

  private entry(intent: OutboxIntent): NewOutboxEntry {
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

  // --- Drafts ---------------------------------------------------------------

  async getDraft(id: string): Promise<BlogpressDraft | null> {
    return this.getOne<BlogpressDraft>(DRAFTS_STORE, id);
  }

  async getDrafts(): Promise<BlogpressDraft[]> {
    const rows = await this.readAll<BlogpressDraft>(DRAFTS_STORE);
    return rows
      .filter((row) => !row.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Upserts the local draft and queues its replay in one transaction. The intent
   * carries `isNew` so the transport chooses a create (idempotent upsert) or an
   * update for the same row.
   */
  async saveDraft(input: DraftSaveInput): Promise<BlogpressDraft> {
    const existing = await this.getDraft(input.id);
    const now = new Date().toISOString();
    const draft: BlogpressDraft = {
      id: input.id,
      clientId: input.clientId ?? existing?.clientId ?? input.id,
      slug: input.slug,
      content: input.content,
      status: input.status ?? existing?.status ?? 'draft',
      coverImage: input.coverImage,
      metaTitle: input.metaTitle,
      metaDesc: input.metaDesc,
      publishAt: input.publishAt !== undefined ? input.publishAt : (existing?.publishAt ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      isNew: input.isNew ?? existing?.isNew ?? true,
      deletedAt: null,
    };
    await this.commit([[DRAFTS_STORE, draft]], {
      entity: 'post',
      type: 'post.save',
      payload: {
        id: draft.id,
        clientId: draft.clientId,
        slug: draft.slug,
        content: draft.content,
        cover_image: draft.coverImage,
        meta_title: draft.metaTitle,
        meta_desc: draft.metaDesc,
        status: draft.status,
        publish_at: draft.publishAt,
        updatedAt: draft.updatedAt,
        isNew: draft.isNew,
      },
    });
    return draft;
  }

  /** Marks a draft as confirmed on the server so later saves replay as updates. */
  async confirmDraft(id: string): Promise<void> {
    const existing = await this.getDraft(id);
    if (!existing || !existing.isNew) return;
    await this.commit([[DRAFTS_STORE, { ...existing, isNew: false }]]);
  }

  /** Applies a transport-resolved body (media URLs swapped in) without a new intent. */
  async applyResolvedContent(id: string, content: string): Promise<void> {
    const existing = await this.getDraft(id);
    if (!existing || existing.content === content) return;
    await this.commit([[DRAFTS_STORE, { ...existing, content }]]);
  }

  async deleteDraft(id: string): Promise<boolean> {
    const existing = await this.getDraft(id);
    if (!existing) return false;
    const now = new Date().toISOString();
    await this.commit([[DRAFTS_STORE, { ...existing, deletedAt: now, updatedAt: now }]], {
      entity: 'post',
      type: 'post.delete',
      payload: { id, updatedAt: now },
    });
    return true;
  }

  // --- Attachments ----------------------------------------------------------

  async putMedia(input: {
    postId: string;
    fileName: string;
    mimeType: string;
    blob: Blob;
  }): Promise<BlogpressMedia> {
    const record: BlogpressMedia = {
      id: uuidv7(),
      postId: input.postId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      blob: input.blob,
      status: 'pending',
      url: null,
    };
    await this.commit([[MEDIA_STORE, record]]);
    return record;
  }

  async getMedia(id: string): Promise<BlogpressMedia | null> {
    return this.getOne<BlogpressMedia>(MEDIA_STORE, id);
  }

  async getPendingMedia(): Promise<BlogpressMedia[]> {
    const rows = await this.readAll<BlogpressMedia>(MEDIA_STORE);
    return rows.filter((row) => row.status === 'pending');
  }

  async markMediaUploaded(id: string, url: string): Promise<void> {
    const existing = await this.getMedia(id);
    if (!existing) return;
    await this.commit([[MEDIA_STORE, { ...existing, status: 'uploaded', url }]]);
  }

  async removeMedia(id: string): Promise<void> {
    const removed = await this.connection.run(async (db) => {
      const transaction = db.transaction(MEDIA_STORE, 'readwrite');
      transaction.objectStore(MEDIA_STORE).delete(id);
      await transactionDone(transaction);
      return true;
    }, false);
    if (removed) this.notifyWrites();
  }

  // --- Seed / merge / claim -------------------------------------------------

  /** Seeds the server loader's data once, then the store is authoritative. */
  async seedIfEmpty(posts: readonly Post[]): Promise<void> {
    if (!(await this.isEmpty())) return;
    const now = new Date().toISOString();
    const writes: Array<[string, unknown]> = posts.map((post) => [
      DRAFTS_STORE,
      draftFromPost(post, now),
    ]);
    if (writes.length > 0) await this.commit(writes);
  }

  /**
   * Merges server rows into the store, last-write-wins on `updatedAt` with the
   * server as the tiebreaker (ADR-0029). Rows with a queued local intent are
   * left alone: an unflushed edit must not be clobbered by an older server copy.
   */
  async mergeServerData(posts: readonly Post[]): Promise<void> {
    const [local, outbox] = await Promise.all([
      this.readAll<BlogpressDraft>(DRAFTS_STORE),
      this.getOutbox(),
    ]);
    const pending = pendingDraftIds(outbox);
    const localById = new Map(local.map((row) => [row.id, row]));

    const writes: Array<[string, unknown]> = [];
    for (const incoming of posts) {
      const key = incoming.client_id ?? incoming.id;
      if (pending.has(incoming.id) || pending.has(key)) continue;
      const existing = localById.get(incoming.id) ?? localById.get(key);
      if (!existing || isServerNewer(incoming.updated_at, existing.updatedAt)) {
        const merged = draftFromPost(incoming, new Date().toISOString());
        writes.push([DRAFTS_STORE, { ...existing, ...merged, id: existing?.id ?? merged.id }]);
      }
    }
    if (writes.length > 0) await this.commit(writes);
  }

  /**
   * Claims a guest store's drafts into this (signed-in) store: dedupe by id,
   * LWW on `updatedAt`, re-home the guest's blobs and re-enqueue its intents so
   * the work done before sign-in syncs under the account (ADR-0027).
   */
  async claimFrom(guest: BlogpressLocalStore): Promise<void> {
    const [guestDrafts, guestMedia, guestOutbox, local] = await Promise.all([
      guest.readAll<BlogpressDraft>(DRAFTS_STORE),
      guest.readAll<BlogpressMedia>(MEDIA_STORE),
      guest.getOutbox(),
      this.readAll<BlogpressDraft>(DRAFTS_STORE),
    ]);

    const localById = new Map(local.map((row) => [row.id, row]));
    const writes: Array<[string, unknown]> = [];
    for (const incoming of guestDrafts) {
      const existing = localById.get(incoming.id);
      if (!existing || isServerNewer(incoming.updatedAt, existing.updatedAt)) {
        writes.push([DRAFTS_STORE, { ...existing, ...incoming }]);
      }
    }
    for (const media of guestMedia) {
      writes.push([MEDIA_STORE, media]);
    }
    // Re-home the guest's pending intents onto the account outbox. Drop `seq`
    // so the account store assigns fresh, monotonic keys in iteration order.
    for (const entry of guestOutbox) {
      const intent: NewOutboxEntry = { ...entry };
      delete (intent as Partial<OutboxEntry>).seq;
      writes.push([OUTBOX_STORE, intent]);
    }

    if (writes.length > 0) {
      const claimed = await this.commit(writes);
      // Absorb the guest only once its rows are actually here: a commit that
      // no-ops because this store is closing (#204) must not wipe data it never
      // copied.
      if (!claimed) return;
    }
    await guest.clear();
  }

  // --- Outbox ---------------------------------------------------------------

  async getOutbox(): Promise<OutboxEntry[]> {
    return this.readAll<OutboxEntry>(OUTBOX_STORE);
  }

  async removeOutbox(seq: number): Promise<void> {
    const removed = await this.connection.run(async (db) => {
      const transaction = db.transaction(OUTBOX_STORE, 'readwrite');
      transaction.objectStore(OUTBOX_STORE).delete(seq);
      await transactionDone(transaction);
      return true;
    }, false);
    if (removed) this.notifyWrites();
  }

  async patchOutbox(seq: number, patch: Partial<OutboxEntry>): Promise<void> {
    const existing = await this.getOne<OutboxEntry>(OUTBOX_STORE, seq);
    if (!existing) return;
    await this.commit([[OUTBOX_STORE, { ...existing, ...patch }]]);
  }

  async retryFailedOutbox(): Promise<void> {
    const failed = (await this.getOutbox()).filter((entry) => entry.status === 'failed');
    if (failed.length === 0) return;
    await this.commit(
      failed.map<[string, OutboxEntry]>((entry) => [
        OUTBOX_STORE,
        { ...entry, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null },
      ])
    );
  }

  /** Empties every owned store (used after a successful claim). */
  async clear(): Promise<void> {
    const cleared = await this.connection.run(async (db) => {
      const transaction = db.transaction([DRAFTS_STORE, MEDIA_STORE, OUTBOX_STORE], 'readwrite');
      for (const store of [DRAFTS_STORE, MEDIA_STORE, OUTBOX_STORE]) {
        transaction.objectStore(store).clear();
      }
      await transactionDone(transaction);
      return true;
    }, false);
    if (cleared) this.notifyWrites();
  }

  /** True when the store has received no writes yet (safe to seed). */
  async isEmpty(): Promise<boolean> {
    const drafts = await this.readAll<BlogpressDraft>(DRAFTS_STORE);
    return drafts.length === 0;
  }
}

/** Maps a server post (or one of its rows) into the local draft shape. */
export function draftFromPost(post: Post, now: string): BlogpressDraft {
  return {
    id: post.id,
    clientId: post.client_id ?? post.id,
    slug: post.slug,
    content: post.content ?? '',
    status: post.status,
    coverImage: post.cover_image ?? '',
    metaTitle: post.meta_title ?? '',
    metaDesc: post.meta_desc ?? '',
    publishAt: post.publish_at,
    createdAt: post.created_at,
    updatedAt: post.updated_at ?? now,
    isNew: false,
    deletedAt: post.deleted_at ?? null,
  };
}

function isServerNewer(serverUpdatedAt?: string, localUpdatedAt?: string): boolean {
  if (!localUpdatedAt) return true;
  if (!serverUpdatedAt) return false;
  return serverUpdatedAt > localUpdatedAt;
}

/** Local draft ids that currently have a queued intent. */
function pendingDraftIds(outbox: OutboxEntry[]): Set<string> {
  const pending = new Set<string>();
  for (const entry of outbox) {
    const payload = (entry.payload ?? {}) as Record<string, unknown>;
    const id = (payload.id as string | undefined) ?? (payload.clientId as string | undefined);
    if (id) pending.add(id);
  }
  return pending;
}
