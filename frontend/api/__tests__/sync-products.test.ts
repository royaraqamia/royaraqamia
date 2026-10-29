import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { LeadsLocalStore } from '@/frontend/api/leads/local-store';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { DRAINABLE_PRODUCTS, PULLABLE_PRODUCTS } from '@/frontend/api/sync-products';
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
  quran: (factory) => QuranLocalStore.open(userIdentity(SESSION.userId), factory),
  linksnap: (factory) => LinksnapLocalStore.open(userIdentity(SESSION.userId), factory),
  notes: (factory) => NotesLocalStore.open(userIdentity(SESSION.userId), factory),
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

  it('includes LinkSnap, whose routes accept the session cookie a worker presents', () => {
    // Its transport carries no token: the browser attaches the cookie (#385).
    expect(DRAINABLE_PRODUCTS.map((product) => product.product)).toContain('linksnap');
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

describe('PULLABLE_PRODUCTS', () => {
  it('covers the products whose pull can run without the page', () => {
    expect(PULLABLE_PRODUCTS.map((product) => product.product).sort()).toEqual(
      ['blogpress', 'habitflow', 'linksnap', 'notes', 'quran', 'spendtrack'].sort()
    );
  });

  it('keeps out the product a background realm cannot pull', () => {
    // Leads are delivered, not owned: no server rows to merge.
    expect(PULLABLE_PRODUCTS.map((product) => product.product)).not.toContain('leads');
  });

  it('never creates a store the page has not opened', async () => {
    const factory = new IDBFactory();
    const before = await existingDatabases(factory);

    for (const product of PULLABLE_PRODUCTS) {
      const identity = product.identity(SESSION);
      expect(identity).not.toBeNull();
      const applied = await product.refresh({
        identity: identity!,
        existingDatabases: before,
        factory,
      });
      expect(applied).toBe(0);
    }

    expect(await existingDatabases(factory)).toEqual(before);
  });
});
