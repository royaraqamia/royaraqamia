import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect } from 'vitest';
import {
  openLocalStore,
  promisifyRequest,
  transactionDone,
  type LocalStoreMigration,
} from '@/frontend/shared/local-store/idb';

function habitMigrations(includeV2 = false): LocalStoreMigration[] {
  const migrations: LocalStoreMigration[] = [
    { version: 1, migrate: (db) => db.createObjectStore('a', { keyPath: 'id' }) },
  ];
  if (includeV2) {
    migrations.push({
      version: 2,
      migrate: (db) => {
        db.createObjectStore('b', { keyPath: 'id' }).createIndex('by_name', 'name');
      },
    });
  }
  return migrations;
}

describe('openLocalStore', () => {
  it('runs every migration to create the declared stores', async () => {
    const db = await openLocalStore('store-a', habitMigrations(true), new IDBFactory());

    expect([...db.objectStoreNames].sort()).toEqual(['a', 'b']);
    db.close();
  });

  it('upgrades incrementally and preserves existing data', async () => {
    const factory = new IDBFactory();

    const v1 = await openLocalStore('store-b', habitMigrations(false), factory);
    const write = v1.transaction('a', 'readwrite');
    write.objectStore('a').put({ id: '1', name: 'first' });
    await transactionDone(write);
    v1.close();

    const v2 = await openLocalStore('store-b', habitMigrations(true), factory);
    expect([...v2.objectStoreNames]).toContain('b');
    const row = await promisifyRequest(v2.transaction('a').objectStore('a').get('1') as IDBRequest);
    expect(row).toEqual({ id: '1', name: 'first' });
    v2.close();
  });

  it('yields to a higher-version open from another tab', async () => {
    const factory = new IDBFactory();

    const stale = await openLocalStore('store-f', habitMigrations(false), factory);
    const fresh = await openLocalStore('store-f', habitMigrations(true), factory);

    expect([...fresh.objectStoreNames].sort()).toEqual(['a', 'b']);
    // The stale connection closed itself so the upgrade was never blocked.
    expect(() => stale.transaction('a')).toThrow();
    fresh.close();
  });

  it('signals when it closes itself for a newer schema version', async () => {
    const factory = new IDBFactory();
    let versionChanges = 0;

    await openLocalStore('store-g', habitMigrations(false), factory, {
      onVersionChange: () => {
        versionChanges += 1;
      },
    });
    const fresh = await openLocalStore('store-g', habitMigrations(true), factory);

    expect(versionChanges).toBe(1);
    fresh.close();
  });

  it('rejects a chain that is not strictly increasing', () => {
    expect(() =>
      openLocalStore(
        'store-c',
        [
          { version: 2, migrate: () => {} },
          { version: 1, migrate: () => {} },
        ],
        new IDBFactory()
      )
    ).toThrow(/strictly increasing/);
  });

  it('rejects duplicate versions and empty chains', () => {
    expect(() =>
      openLocalStore(
        'store-d',
        [
          { version: 1, migrate: () => {} },
          { version: 1, migrate: () => {} },
        ],
        new IDBFactory()
      )
    ).toThrow(/strictly increasing/);

    expect(() => openLocalStore('store-e', [], new IDBFactory())).toThrow(/at least one migration/);
  });
});
