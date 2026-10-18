import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStoreConnection } from '@/frontend/shared/local-store/connection';
import { openLocalStore, type LocalStoreMigration } from '@/frontend/shared/local-store/idb';
import { createOutboxAccess, openOutboxAccess } from '@/frontend/shared/local-store/outbox-access';
import { OUTBOX_STORE, type NewOutboxEntry } from '@/frontend/shared/local-store/outbox';

const DB = 'probe__user:u-1';

const MIGRATIONS: LocalStoreMigration[] = [
  {
    version: 1,
    migrate: (db) => {
      db.createObjectStore(OUTBOX_STORE, { keyPath: 'seq', autoIncrement: true });
    },
  },
];

function entry(overrides: Partial<NewOutboxEntry> = {}): NewOutboxEntry {
  return {
    id: 'intent-1',
    entity: 'probe',
    type: 'probe.create',
    payload: {},
    createdAt: 1,
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
    ...overrides,
  };
}

/** Writes entries into the store the way a product store would, then closes. */
async function seed(factory: IDBFactory, entries: NewOutboxEntry[]): Promise<void> {
  const db = await openLocalStore(DB, MIGRATIONS, factory);
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(OUTBOX_STORE, 'readwrite');
    for (const item of entries) transaction.objectStore(OUTBOX_STORE).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  const databases = await factory.databases();
  return databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === 'string');
}

let factory: IDBFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

describe('createOutboxAccess', () => {
  it('patches an intent and notifies the owning store', async () => {
    await seed(factory, [entry()]);
    const connection = new LocalStoreConnection(await openLocalStore(DB, MIGRATIONS, factory));
    const onWrite = vi.fn();
    const outbox = createOutboxAccess(connection, onWrite);

    await outbox.patchOutbox(1, { attempts: 3, lastError: 'boom' });

    const [stored] = await outbox.getOutbox();
    expect(stored).toMatchObject({ attempts: 3, lastError: 'boom', type: 'probe.create' });
    expect(onWrite).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('removes an intent and notifies the owning store', async () => {
    await seed(factory, [entry(), entry({ id: 'intent-2', type: 'probe.update' })]);
    const connection = new LocalStoreConnection(await openLocalStore(DB, MIGRATIONS, factory));
    const onWrite = vi.fn();
    const outbox = createOutboxAccess(connection, onWrite);

    await outbox.removeOutbox(1);

    expect((await outbox.getOutbox()).map((stored) => stored.type)).toEqual(['probe.update']);
    expect(onWrite).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('ignores a patch for an intent that is gone', async () => {
    await seed(factory, []);
    const connection = new LocalStoreConnection(await openLocalStore(DB, MIGRATIONS, factory));
    const onWrite = vi.fn();
    const outbox = createOutboxAccess(connection, onWrite);

    await outbox.patchOutbox(99, { attempts: 1 });

    expect(onWrite).not.toHaveBeenCalled();
    connection.close();
  });

  it('re-arms only the permanently-failed intents on a manual retry', async () => {
    await seed(factory, [
      entry({ id: 'a', status: 'failed', attempts: 4, lastError: 'nope', nextAttemptAt: 500 }),
      entry({ id: 'b', status: 'pending', attempts: 2, nextAttemptAt: 900 }),
    ]);
    const connection = new LocalStoreConnection(await openLocalStore(DB, MIGRATIONS, factory));
    const onWrite = vi.fn();
    const outbox = createOutboxAccess(connection, onWrite);

    await outbox.retryFailedOutbox();

    const stored = await outbox.getOutbox();
    expect(stored[0]).toMatchObject({
      id: 'a',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    });
    expect(stored[1]).toMatchObject({ id: 'b', attempts: 2, nextAttemptAt: 900 });
    expect(onWrite).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it('resolves without touching IndexedDB once the connection is closing', async () => {
    await seed(factory, [entry()]);
    const connection = new LocalStoreConnection(await openLocalStore(DB, MIGRATIONS, factory));
    const onWrite = vi.fn();
    const outbox = createOutboxAccess(connection, onWrite);
    connection.close();

    await expect(outbox.removeOutbox(1)).resolves.toBeUndefined();
    await expect(outbox.getOutbox()).resolves.toEqual([]);
    expect(onWrite).not.toHaveBeenCalled();
  });
});

describe('openOutboxAccess', () => {
  it('opens the Outbox of a database that already exists', async () => {
    await seed(factory, [entry()]);

    const opened = await openOutboxAccess(DB, {
      existingDatabases: await databaseNames(factory),
      factory,
    });

    expect(opened).not.toBeNull();
    expect((await opened!.store.getOutbox()).map((stored) => stored.type)).toEqual([
      'probe.create',
    ]);
    opened!.close();
  });

  it('never creates a database, even for a name it was asked for', async () => {
    const before = await databaseNames(factory);

    const opened = await openOutboxAccess('probe__guest', {
      existingDatabases: before,
      factory,
    });

    expect(opened).toBeNull();
    // A storeless version-1 database would be unrepairable: the product's first
    // migration is skipped on an upgrade, so the rest run against no schema.
    expect(await databaseNames(factory)).toEqual(before);
  });

  it('does nothing where the realm cannot list databases', async () => {
    await seed(factory, [entry()]);

    const opened = await openOutboxAccess(DB, { existingDatabases: null, factory });

    expect(opened).toBeNull();
  });

  it('attaches to the existing schema version instead of upgrading it', async () => {
    await seed(factory, [entry()]);
    const [before] = (await factory.databases()).filter((database) => database.name === DB);

    const opened = await openOutboxAccess(DB, {
      existingDatabases: await databaseNames(factory),
      factory,
    });
    const [during] = (await factory.databases()).filter((database) => database.name === DB);

    expect(during?.version).toBe(before?.version);
    opened!.close();
  });

  it('lets go when a page opens a newer schema version', async () => {
    await seed(factory, [entry()]);
    const opened = await openOutboxAccess(DB, {
      existingDatabases: await databaseNames(factory),
      factory,
    });

    // What a page does on the next release: openLocalStore with a longer chain.
    const upgraded = await openLocalStore(
      DB,
      [
        ...MIGRATIONS,
        {
          version: 2,
          migrate: (db) => {
            db.createObjectStore('added-in-v2', { keyPath: 'id' });
          },
        },
      ],
      factory
    );

    await expect(opened!.store.getOutbox()).resolves.toEqual([]);
    upgraded.close();
  });
});
