import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LOCAL_STORE_PRODUCTS } from '@/frontend/shared/local-store/products';

/**
 * #1912: the registry is checked against the tree, not against itself.
 *
 * `LOCAL_STORE_PRODUCTS` claims to name every product that keeps a Local Store
 * on this device, but the only thing it was compared to was `LOCAL_STORE_ROOTS`
 * — a second hand-written list, extended by the same hand at the same moment. So
 * `notes` shipped a store, a route and a snapshot while sitting in neither list,
 * and the guard for #493/#495 read no file behind `/notes` and stayed green.
 *
 * The products are discovered from `frontend/api/<product>/local-store.ts`, the
 * file that opens the device database, so adding the ninth store fails here
 * instead of going unchecked. A product whose root or snapshot cannot be checked
 * is still registered; its `LOCAL_STORE_ROOTS` row states why, with a reason,
 * rather than the product going missing.
 */

const ROOT = process.cwd();
const STORES = resolve(ROOT, 'frontend', 'api');

/** The store's own declaration of the partition it opens — `const PRODUCT = '…'`. */
const DECLARED_PRODUCT = /const PRODUCT = '([^']+)'/;

const stores = readdirSync(STORES, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(resolve(STORES, entry.name, 'local-store.ts'))
  )
  .map((entry) => entry.name)
  .sort();

describe('LOCAL_STORE_PRODUCTS against the tree', () => {
  it('finds the products that ship a Local Store', () => {
    // A registry compared to an empty tree would pass for the wrong reason.
    expect(stores.length).toBeGreaterThan(0);
  });

  it('registers every product that ships a store, and only those', () => {
    const registered = LOCAL_STORE_PRODUCTS.map((product) => product.product).sort();

    expect(new Set(registered).size, 'a product is registered twice').toBe(registered.length);
    expect(registered).toEqual(stores);
  });

  it('names the partition its own store opens', () => {
    for (const product of stores) {
      const text = readFileSync(resolve(STORES, product, 'local-store.ts'), 'utf8');
      const declared = DECLARED_PRODUCT.exec(text)?.[1];

      expect(declared, `${product}: local-store.ts declares no PRODUCT`).toBe(product);
    }
  });
});
