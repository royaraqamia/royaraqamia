import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { LeadsLocalStore } from '@/frontend/api/leads/local-store';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { DRAINABLE_PRODUCTS } from '@/frontend/api/sync-products';
import { userIdentity } from '@/frontend/shared/local-store/identity';

/**
 * The registry names databases by string, because a service worker cannot import
 * a product's store just to ask it what its database is called. That is exactly
 * the kind of coupling that rots silently — a renamed `PRODUCT` would leave the
 * background flush looking at a database nothing writes to, and no test would
 * notice. So this opens every real store and asserts the registry finds it.
 */

const SESSION = { userId: 'u-1' };

/** How a *page* opens each product's store, which is the thing to agree with. */
const PAGE_STORES: Record<string, (factory: IDBFactory) => Promise<{ close: () => void }>> = {
  habitflow: (factory) => HabitLocalStore.open(userIdentity(SESSION.userId), factory),
  spendtrack: (factory) => SpendtrackLocalStore.open(userIdentity(SESSION.userId), factory),
  blogpress: (factory) => BlogpressLocalStore.open(userIdentity(SESSION.userId), factory),
  leads: (factory) => LeadsLocalStore.open(factory),
};

async function existingDatabases(factory: IDBFactory): Promise<string[]> {
  const databases = await factory.databases();
  return databases
    .map((database) => database.name)
    .filter((name): name is string => typeof name === 'string');
}

describe('DRAINABLE_PRODUCTS', () => {
  it('covers every product this test knows a page store for', () => {
    expect(DRAINABLE_PRODUCTS.map((product) => product.product).sort()).toEqual(
      Object.keys(PAGE_STORES).sort()
    );
  });

  it('keeps LinkSnap out, because its API takes a bearer token and not the cookie', () => {
    // A worker cannot read either one, so a drain would replay with no credential.
    expect(DRAINABLE_PRODUCTS.map((product) => product.product)).not.toContain('linksnap');
  });

  for (const product of DRAINABLE_PRODUCTS) {
    describe(product.product, () => {
      it('finds the store the page opens, and never creates one', async () => {
        const factory = new IDBFactory();
        const identity = product.identity(SESSION);
        expect(identity).not.toBeNull();

        // Before the page has ever opened it: the drain must not create it.
        const before = await existingDatabases(factory);
        const missing = await product.open({
          identity: identity!,
          existingDatabases: before,
          factory,
        });
        expect(missing).toBeNull();
        expect(await existingDatabases(factory)).toEqual(before);

        // The page opens its real store, under whatever identity it uses.
        const pageStore = await PAGE_STORES[product.product]!(factory);
        pageStore.close();

        const opened = await product.open({
          identity: identity!,
          existingDatabases: await existingDatabases(factory),
          factory,
        });
        expect(opened).not.toBeNull();
        await expect(opened!.store.getOutbox()).resolves.toEqual([]);
        opened!.close();
      });
    });
  }
});
