import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { LeadsLocalStore } from '@/frontend/api/leads/local-store';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import {
  DeviceListingUnsupportedError,
  LOCAL_STORE_PRODUCTS,
  derivedDeviceCopies,
  readDeviceCopies,
  removeDeviceCopies,
  retryDeviceEntry,
} from '@/frontend/shared/local-store/device-copy';
import {
  GUEST_IDENTITY,
  localStoreName,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import { openLocalStore, type LocalStoreMigration } from '@/frontend/shared/local-store/idb';
import { OUTBOX_STORE, type NewOutboxEntry } from '@/frontend/shared/local-store/outbox';

/**
 * The diagnostics view names databases by string, because it must read a queue
 * without importing the product that owns it. That is the same silent-drift
 * risk the drain registry test guards: a renamed `PRODUCT` would leave the page
 * showing an empty device while writes queue somewhere else. So the coverage
 * test opens every real store and asserts the page finds it.
 */

const IDENTITY = userIdentity('u-1');

/** How a page opens each product's store, which is the thing to agree with. */
const PAGE_STORES: Record<string, (factory: IDBFactory) => Promise<{ close: () => void }>> = {
  habitflow: (factory) => HabitLocalStore.open(IDENTITY, factory),
  spendtrack: (factory) => SpendtrackLocalStore.open(IDENTITY, factory),
  linksnap: (factory) => LinksnapLocalStore.open(IDENTITY, factory),
  blogpress: (factory) => BlogpressLocalStore.open(IDENTITY, factory),
  quran: (factory) => QuranLocalStore.open(IDENTITY, factory),
  leads: (factory) => LeadsLocalStore.open(factory),
};

/** A stand-in store with nothing but an Outbox, for the read/retry/remove cases. */
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
    entity: 'habit',
    type: 'habit.create',
    payload: {},
    createdAt: Date.parse('2026-10-20T10:00:00Z'),
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
    ...overrides,
  };
}

async function seed(factory: IDBFactory, name: string, entries: NewOutboxEntry[]): Promise<void> {
  const db = await openLocalStore(name, MIGRATIONS, factory);
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
    .filter((name): name is string => typeof name === 'string')
    .sort();
}

describe('LOCAL_STORE_PRODUCTS', () => {
  it('covers every product this test knows a page store for', () => {
    expect(LOCAL_STORE_PRODUCTS.map((product) => product.product).sort()).toEqual(
      Object.keys(PAGE_STORES).sort()
    );
  });

  it('finds the store every page opens, under the name it opened', async () => {
    const factory = new IDBFactory();

    for (const open of Object.values(PAGE_STORES)) {
      const store = await open(factory);
      store.close();
    }

    const copies = await readDeviceCopies(factory);
    expect(copies.map((copy) => copy.product).sort()).toEqual(Object.keys(PAGE_STORES).sort());

    // LinkSnap is included on purpose although the worker drain excludes it: its
    // queue is still readable here, and its own tab is what delivers it.
    expect(copies.find((copy) => copy.product === 'linksnap')).toMatchObject({
      identity: IDENTITY,
      entries: [],
      error: null,
    });
  });
});

describe('readDeviceCopies', () => {
  it('lists account and guest copies with their queues, and no strangers', async () => {
    const factory = new IDBFactory();
    const account = localStoreName('habitflow', IDENTITY);
    const guest = localStoreName('habitflow', GUEST_IDENTITY);

    await seed(factory, account, [
      entry(),
      entry({ id: 'intent-2', type: 'log.toggle', entity: 'habit_log' }),
    ]);
    await seed(factory, guest, [entry({ id: 'intent-3', type: 'habit.restore' })]);
    await seed(factory, 'someone-elses-store', [entry()]);

    const copies = await readDeviceCopies(factory);

    expect(copies.map((copy) => copy.name).sort()).toEqual([account, guest].sort());
    const accountCopy = copies.find((copy) => copy.name === account)!;
    const guestCopy = copies.find((copy) => copy.name === guest)!;
    expect(accountCopy.identity).toBe(IDENTITY);
    expect(guestCopy.identity).toBe(GUEST_IDENTITY);
    expect(accountCopy.entries.map((item) => item.type)).toEqual(['habit.create', 'log.toggle']);
    expect(guestCopy.entries).toHaveLength(1);
    expect(copies.every((copy) => copy.label.length > 0 && copy.error === null)).toBe(true);
  });

  it('reports a copy whose queue cannot be read instead of dropping it', async () => {
    const factory = new IDBFactory();
    const name = localStoreName('habitflow', IDENTITY);

    // A database under our name with no Outbox: a schema this build cannot read.
    const db = await openLocalStore(
      name,
      [
        {
          version: 1,
          migrate: (database) => database.createObjectStore('habits', { keyPath: 'id' }),
        },
      ],
      factory
    );
    db.close();

    const [copy] = await readDeviceCopies(factory);
    expect(copy).toMatchObject({ name, entries: [] });
    expect(copy!.error).not.toBeNull();
  });

  it('says so when the browser cannot list its databases', async () => {
    await expect(readDeviceCopies({} as IDBFactory)).rejects.toBeInstanceOf(
      DeviceListingUnsupportedError
    );
  });
});

describe('retryDeviceEntry', () => {
  it('re-arms one failed intent without touching the rest of the queue', async () => {
    const factory = new IDBFactory();
    const name = localStoreName('habitflow', IDENTITY);

    await seed(factory, name, [
      entry({ id: 'a', status: 'failed', attempts: 5, lastError: 'nope', nextAttemptAt: 500 }),
      entry({ id: 'b', status: 'failed', attempts: 2, lastError: 'also nope' }),
    ]);

    await expect(retryDeviceEntry(name, 1, factory)).resolves.toBe(true);

    const [copy] = await readDeviceCopies(factory);
    expect(copy!.entries[0]).toMatchObject({
      id: 'a',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    });
    expect(copy!.entries[1]).toMatchObject({ id: 'b', status: 'failed', lastError: 'also nope' });
  });

  it('refuses to create a database the page has not opened', async () => {
    const factory = new IDBFactory();
    const before = await databaseNames(factory);

    await expect(retryDeviceEntry(localStoreName('habitflow', IDENTITY), 1, factory)).resolves.toBe(
      false
    );
    expect(await databaseNames(factory)).toEqual(before);
  });
});

describe('removeDeviceCopies', () => {
  it('deletes the copy, counts the queue it takes with it and leaves the rest', async () => {
    const factory = new IDBFactory();
    const account = localStoreName('habitflow', IDENTITY);
    const guest = localStoreName('habitflow', GUEST_IDENTITY);

    await seed(factory, account, [entry(), entry({ id: 'intent-2' })]);
    await seed(factory, guest, [entry({ id: 'intent-3' })]);

    const removal = await removeDeviceCopies([account], factory);
    expect(removal).toEqual({ removed: [account], blocked: [], queued: 2 });

    expect((await readDeviceCopies(factory)).map((copy) => copy.name)).toEqual([guest]);
  });

  it('is a no-op for a copy that is already gone', async () => {
    const factory = new IDBFactory();
    const removal = await removeDeviceCopies(['habitflow__user:gone'], factory);

    expect(removal).toEqual({ removed: [], blocked: [], queued: 0 });
    expect(await databaseNames(factory)).toEqual([]);
  });

  it('still deletes by name where the browser cannot list its databases', async () => {
    const factory = new IDBFactory();
    const name = localStoreName('habitflow', IDENTITY);
    await seed(factory, name, [entry()]);

    // What the page's fallback holds: a factory that can delete but not list.
    const listingless = {
      deleteDatabase: factory.deleteDatabase.bind(factory),
    } as unknown as IDBFactory;

    const removal = await removeDeviceCopies([name], listingless);
    expect(removal).toEqual({ removed: [name], blocked: [], queued: 0 });
    expect(await databaseNames(factory)).toEqual([]);
  });
});

describe('derivedDeviceCopies', () => {
  it('names every product’s database for an identity the browser cannot list', () => {
    const copies = derivedDeviceCopies(GUEST_IDENTITY);

    expect(copies.map((copy) => copy.name)).toEqual(
      LOCAL_STORE_PRODUCTS.map((product) => localStoreName(product.product, GUEST_IDENTITY))
    );
  });
});
