import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { ChatsLocalStore } from '@/frontend/api/chats/local-store';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { GUEST_IDENTITY, localStoreName } from '@/frontend/shared/local-store/identity';
import type { LocalStoreMigration } from '@/frontend/shared/local-store/idb';
import { mirrorFor } from '@/frontend/shared/local-store/mirror';
import {
  openProductStore,
  type ProductStoreScope,
} from '@/frontend/shared/local-store/open-product-store';
import { OUTBOX_STORE } from '@/frontend/shared/local-store/outbox';
import type { ChatConversationSummary } from '@/shared/contracts/chat';

/**
 * #1911: the record-write half of the Local Store lived in seven copies, and the
 * copies had already drifted into three contracts. `records.ts` is now the only
 * implementation, so these tests assert the shared behaviour once and then the
 * invariant the comments used to restate per product: a subscriber registered
 * with `subscribeWrites` reads the committed row on the first notification.
 */

const PROBE = 'record-probe';
const RECORDS_STORE = 'records';

const MIGRATIONS: readonly LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      db.createObjectStore(RECORDS_STORE, { keyPath: 'id' });
    },
  },
  {
    version: 2,
    migrate: (db) => {
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    },
  },
];

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

function openProbe(options: { stampClientId?: boolean } = {}): Promise<ProductStoreScope> {
  return openProductStore({
    product: PROBE,
    identity: GUEST_IDENTITY,
    migrations: MIGRATIONS,
    stores: { [RECORDS_STORE]: 'id' },
    ...options,
    factory,
  });
}

describe('createRecordAccess', () => {
  it('lands the row, its intent and the mirror update in one commit', async () => {
    const scope = await openProbe();
    const { records, connection, outbox } = scope;

    // Hydrate first: the mirror drops a write to a store nobody has read (#494).
    await records.readAll(RECORDS_STORE);
    const snapshots: unknown[][] = [];
    records.subscribeWrites(() => {
      snapshots.push([...(connection.mirror.read(RECORDS_STORE) ?? [])]);
    });

    const committed = await records.commit([[RECORDS_STORE, { id: 'a', body: 'first' }]], {
      entity: 'probe',
      type: 'probe.create',
      payload: { id: 'a' },
    });

    expect(committed).toBe(true);
    // One notification, one row in the mirror, one intent in the queue — the
    // same tick, so the subscriber never reads a stale list.
    expect(snapshots).toEqual([[{ id: 'a', body: 'first' }]]);
    expect(await records.readAll(RECORDS_STORE)).toEqual([{ id: 'a', body: 'first' }]);
    expect(await records.getOne(RECORDS_STORE, 'a')).toEqual({ id: 'a', body: 'first' });

    const queued = await outbox.getOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      entity: 'probe',
      type: 'probe.create',
      payload: { id: 'a' },
      status: 'pending',
    });
    scope.connection.close();
  });

  it('stamps the entry id into the payload when the store asks for it (Quran)', async () => {
    const scope = await openProbe({ stampClientId: true });

    await scope.records.commitChanges([{ store: RECORDS_STORE, put: { id: 'b' } }], {
      entity: 'probe',
      type: 'probe.set',
      payload: { surah: 1 },
    });

    const [queued] = await scope.outbox.getOutbox();
    expect(queued?.payload).toMatchObject({ surah: 1, clientId: queued?.id });
    scope.connection.close();
  });

  it('commits a put and a delete in one transaction, then re-hydrates the mirror', async () => {
    const scope = await openProbe();
    const { records, connection } = scope;
    await records.commit([
      [RECORDS_STORE, { id: 'old', body: 'old' }],
      [RECORDS_STORE, { id: 'keep', body: 'before' }],
    ]);

    await records.commitChanges([
      { store: RECORDS_STORE, delete: 'old' },
      { store: RECORDS_STORE, put: { id: 'keep', body: 'after' } },
    ]);

    // A store that lost a row is dropped rather than patched: the mirror has no
    // per-row delete, and a half-updated list would be a lie.
    expect(connection.mirror.read(RECORDS_STORE)).toBeNull();
    expect(await records.readAll(RECORDS_STORE)).toEqual([{ id: 'keep', body: 'after' }]);
    scope.connection.close();
  });

  it('deletes rows by key, drops the mirror and notifies once', async () => {
    const scope = await openProbe();
    const { records, connection } = scope;
    await records.commit([[RECORDS_STORE, { id: 'a' }]]);
    await records.readAll(RECORDS_STORE);

    let notifications = 0;
    records.subscribeWrites(() => {
      notifications += 1;
    });
    await records.delete(RECORDS_STORE, ['a']);

    expect(notifications).toBe(1);
    expect(connection.mirror.read(RECORDS_STORE)).toBeNull();
    expect(await records.readAll(RECORDS_STORE)).toEqual([]);
    scope.connection.close();
  });

  it('empties the named stores and forgets their mirrors', async () => {
    const scope = await openProbe();
    const { records, connection } = scope;
    await records.commit([[RECORDS_STORE, { id: 'a' }]]);
    await records.readAll(RECORDS_STORE);

    await records.clear([RECORDS_STORE, OUTBOX_STORE]);

    expect(connection.mirror.read(RECORDS_STORE)).toBeNull();
    expect(await records.readAll(RECORDS_STORE)).toEqual([]);
    expect(await scope.outbox.getOutbox()).toEqual([]);
    scope.connection.close();
  });

  it('no-ops every read and write once the lease is closed (#204)', async () => {
    const scope = await openProbe();
    let notifications = 0;
    scope.records.subscribeWrites(() => {
      notifications += 1;
    });
    scope.connection.close();

    await expect(
      scope.records.commit([[RECORDS_STORE, { id: 'a' }]], {
        entity: 'probe',
        type: 'probe.create',
        payload: {},
      })
    ).resolves.toBe(false);
    await expect(scope.records.readAll(RECORDS_STORE)).resolves.toEqual([]);
    expect(notifications).toBe(0);
  });
});

/** The one write each product store exposes, and the store it lands in. */
interface ProductCase {
  product: string;
  store: string;
  key: 'id' | 'clientId';
  /** A cache write (Chats' thread list) is a record write with no replay. */
  queuesIntent: boolean;
  open: (factory: IDBFactory) => Promise<{
    subscribeWrites: (listener: () => void) => () => void;
    close: () => void;
    hydrate: () => Promise<unknown>;
    write: () => Promise<string>;
    outbox: () => Promise<unknown[]>;
  }>;
}

function conversation(id: string): ChatConversationSummary {
  return {
    id,
    kind: 'direct',
    status: 'active',
    title: 'thread',
    counterpart: null,
    myStatus: 'active',
    lastMessage: null,
    unreadCount: 0,
    lastMessageAt: null,
    createdAt: '2026-11-26T00:00:00.000Z',
  };
}

const PRODUCTS: readonly ProductCase[] = [
  {
    product: 'notes',
    store: 'notes',
    key: 'id',
    queuesIntent: true,
    open: async (openFactory) => {
      const store = await NotesLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.getNotes(),
        write: async () => (await store.createNote({ body: 'note' })).id,
        outbox: () => store.getOutbox(),
      };
    },
  },
  {
    product: 'habitflow',
    store: 'habits',
    key: 'id',
    queuesIntent: true,
    open: async (openFactory) => {
      const store = await HabitLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.getHabits(),
        write: async () => (await store.createHabit({ name: 'habit', frequency: 'daily' })).id,
        outbox: () => store.getOutbox(),
      };
    },
  },
  {
    product: 'spendtrack',
    store: 'categories',
    key: 'id',
    queuesIntent: true,
    open: async (openFactory) => {
      const store = await SpendtrackLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.getCategories(),
        write: async () => (await store.createCategory({ name: 'food', colorHex: '#10b981' })).id,
        outbox: () => store.getOutbox(),
      };
    },
  },
  {
    product: 'linksnap',
    store: 'links',
    key: 'clientId',
    queuesIntent: true,
    open: async (openFactory) => {
      const store = await LinksnapLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.getLinks(),
        write: async () =>
          (await store.createLink({ originalUrl: 'https://example.com' })).clientId,
        outbox: () => store.getOutbox(),
      };
    },
  },
  {
    product: 'blogpress',
    store: 'drafts',
    key: 'id',
    queuesIntent: true,
    open: async (openFactory) => {
      const store = await BlogpressLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.getDrafts(),
        write: async () =>
          (
            await store.saveDraft({
              id: 'draft-1',
              slug: 'draft-1',
              content: 'body',
              coverImage: '',
              metaTitle: '',
              metaDesc: '',
            })
          ).id,
        outbox: () => store.getOutbox(),
      };
    },
  },
  {
    product: 'quran',
    store: 'bookmarks',
    key: 'clientId',
    queuesIntent: true,
    open: async (openFactory) => {
      const store = await QuranLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.listBookmarks(),
        write: async () => {
          await store.toggleBookmark(1, 1);
          return (await store.listBookmarks())[0]!.clientId;
        },
        outbox: () => store.getOutbox(),
      };
    },
  },
  {
    product: 'chats',
    store: 'threads',
    key: 'id',
    queuesIntent: false,
    open: async (openFactory) => {
      const store = await ChatsLocalStore.open(GUEST_IDENTITY, openFactory);
      return {
        subscribeWrites: (listener) => store.subscribeWrites(listener),
        close: () => store.close(),
        hydrate: () => store.getThreads(),
        write: async () => {
          await store.saveThreads([conversation('thread-1')]);
          return 'thread-1';
        },
        outbox: () => store.getOutbox(),
      };
    },
  },
];

describe('the mirror-update invariant, in every product store', () => {
  for (const product of PRODUCTS) {
    it(`${product.product}: the first notification already carries the committed row`, async () => {
      const opened = await product.open(factory);
      const mirror = mirrorFor(localStoreName(product.product, GUEST_IDENTITY), factory);

      // Each store hydrates through the same mirror its writes feed.
      expect(mirror.has(product.store)).toBe(false);
      await opened.hydrate();
      expect(mirror.has(product.store)).toBe(true);

      const notifications: unknown[][] = [];
      const unsubscribe = opened.subscribeWrites(() => {
        notifications.push([...(mirror.read(product.store) ?? [])]);
      });

      const key = await opened.write();
      const queued = await opened.outbox();
      unsubscribe();
      opened.close();

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toContainEqual(expect.objectContaining({ [product.key]: key }));
      // A member write and its replay intent commit together; a cache write
      // (Chats' thread window) is a record write with nothing to replay.
      expect(queued).toHaveLength(product.queuesIntent ? 1 : 0);
    });
  }
});
