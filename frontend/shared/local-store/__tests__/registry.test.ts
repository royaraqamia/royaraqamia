import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import {
  GUEST_IDENTITY,
  localStoreName,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import {
  acquireLocalStore,
  closeAllLocalStores,
  closeIdentityStores,
  closeLocalStore,
} from '@/frontend/shared/local-store/connection';

/**
 * #494: one connection per identity per realm.
 *
 * Before this, every store open was a new `IDBDatabase`: a route change
 * re-opened the database and re-read every list, and two components could hold
 * two connections to the same name. These tests count the opens and the reads,
 * because that is what the issue promises — not a warm-feeling render.
 */

/** A factory that records which database names were opened through it. */
function countingFactory() {
  const inner = new IDBFactory();
  const opened: string[] = [];

  const factory = {
    open(name: string, version?: number) {
      opened.push(name);
      return version === undefined ? inner.open(name) : inner.open(name, version);
    },
  } as unknown as IDBFactory;

  return { factory, opened };
}

describe('the Local Store registry', () => {
  it('opens one database per identity, however many stores ask for it', async () => {
    const { factory, opened } = countingFactory();

    const first = await HabitLocalStore.open(GUEST_IDENTITY, factory);
    const second = await HabitLocalStore.open(GUEST_IDENTITY, factory);

    expect(opened).toEqual([localStoreName('habitflow', GUEST_IDENTITY)]);
    // Closing one holder does not close the other's connection.
    first.close();
    await expect(second.getHabits()).resolves.toEqual([]);

    await closeAllLocalStores(factory);
  });

  it('shares the in-flight open when two hooks mount together', async () => {
    const { factory, opened } = countingFactory();

    const [a, b] = await Promise.all([
      HabitLocalStore.open(GUEST_IDENTITY, factory),
      HabitLocalStore.open(GUEST_IDENTITY, factory),
    ]);

    expect(opened).toHaveLength(1);
    a.close();
    b.close();
    await closeAllLocalStores(factory);
  });

  it('serves an already-read list without touching IndexedDB again', async () => {
    const factory = new IDBFactory();

    const first = await HabitLocalStore.open(GUEST_IDENTITY, factory);
    await first.createHabit({ name: 'قراءة', frequency: 'daily' });
    await first.getHabits();
    first.close();

    // A route change: the same database, a new lease, a fresh read of a list
    // that did not change.
    const second = await HabitLocalStore.open(GUEST_IDENTITY, factory);
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');

    try {
      expect(await second.getHabits()).toHaveLength(1);
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
      second.close();
      await closeAllLocalStores(factory);
    }
  });

  it('keeps a second identity on its own connection and data', async () => {
    const factory = new IDBFactory();

    const guest = await HabitLocalStore.open(GUEST_IDENTITY, factory);
    const account = await HabitLocalStore.open(userIdentity('u-1'), factory);
    await guest.createHabit({ name: 'ضيف', frequency: 'daily' });

    await closeIdentityStores(GUEST_IDENTITY, factory);

    // The guest connection is gone, the account's is untouched.
    await expect(guest.getHabits()).resolves.toEqual([]);
    await expect(account.getHabits()).resolves.toEqual([]);

    guest.close();
    account.close();
    await closeAllLocalStores(factory);
  });

  it('reopens a database that was closed for a newer schema version', async () => {
    const factory = new IDBFactory();
    const name = localStoreName('habitflow', GUEST_IDENTITY);

    const lease = await acquireLocalStore(
      name,
      [{ version: 1, migrate: (db) => void db.createObjectStore('habits', { keyPath: 'id' }) }],
      factory
    );

    // Another tab opens a newer version; the platform closes ours.
    const newer = factory.open(name, 2);
    await new Promise<void>((resolve, reject) => {
      newer.onsuccess = () => resolve();
      newer.onerror = () => reject(newer.error);
    });

    // Every operation on the stale lease no-ops instead of throwing (#204).
    await expect(lease.run(async () => 'read', 'skipped')).resolves.toBe('skipped');

    await closeLocalStore(name, factory);
    newer.result.close();
  });

  it('gives each store a lease, not a connection, so one close cannot yank another', async () => {
    const factory = new IDBFactory();

    const links = await LinksnapLocalStore.open(GUEST_IDENTITY, factory);
    const second = await LinksnapLocalStore.open(GUEST_IDENTITY, factory);
    await links.createLink({ originalUrl: 'https://example.com' });

    second.close();

    await expect(second.getLinks()).resolves.toEqual([]);
    await expect(links.getLinks()).resolves.toHaveLength(1);

    links.close();
    await closeAllLocalStores(factory);
  });
});
