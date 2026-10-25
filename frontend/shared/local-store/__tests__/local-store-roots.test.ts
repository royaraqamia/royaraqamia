import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LOCAL_STORE_PRODUCTS, LOCAL_STORE_ROOTS } from '@/frontend/shared/local-store/device-copy';

/**
 * The guard for #493 and #495.
 *
 * Every product with a Local Store paints from it before the session resolves,
 * and carries the last screen it painted into the next cold first frame. The only
 * way that stays true is if each product's root resolves the identity through
 * `useLocalIdentity` instead of `useSession().user`, and its store hook reads and
 * records a snapshot. A product added to `LOCAL_STORE_PRODUCTS` without an entry
 * in `LOCAL_STORE_ROOTS` — or whose root reaches for the session directly, or
 * whose hook forgot the snapshot — is exactly the regression this fails on, so a
 * seventh product cannot ship a store and quietly re-introduce the skeleton.
 *
 * It reads source text rather than mounting the components: the roots import
 * next/navigation, the auth client and five product stores, so a render test
 * would be a fixture factory for each of them, and what is being asserted is an
 * import, not a render.
 */

const ROOT = process.cwd();

/** The one way a product root learns whose rows it is painting. */
const RESOLVER = 'useLocalIdentity(';

/** Reads the session's user — a credential, never a partition. */
const SESSION_USER = 'useSession().user';

/**
 * The two halves of the first-frame path: read it during render, record it after
 * paint. Matched as names rather than calls because the read is generic in every
 * product (`useSnapshot<DashboardSnapshot>(…)`).
 */
const SNAPSHOT_READ = 'useSnapshot';
const SNAPSHOT_WRITE = 'useSnapshotRecorder';

const CHECKED = LOCAL_STORE_ROOTS.filter((entry) => entry.root !== null);
const SNAPSHOTTED = LOCAL_STORE_ROOTS.filter((entry) => entry.snapshot !== null);

describe('LOCAL_STORE_ROOTS', () => {
  it('names a root for every registered product', () => {
    const registered = LOCAL_STORE_PRODUCTS.map((product) => product.product).sort();
    const named = LOCAL_STORE_ROOTS.map((entry) => entry.product).sort();

    expect(named).toEqual(registered);
  });

  it('only names products that exist', () => {
    const registered = new Set(LOCAL_STORE_PRODUCTS.map((product) => product.product));

    for (const entry of LOCAL_STORE_ROOTS) {
      expect(registered.has(entry.product), entry.product).toBe(true);
    }
  });

  it('exempts a product only with a stated reason', () => {
    for (const entry of LOCAL_STORE_ROOTS) {
      if (entry.root === null || entry.snapshot === null) {
        expect(entry.exemption, entry.product).toBeTruthy();
      } else {
        expect(entry.exemption, entry.product).toBeUndefined();
      }
    }
  });

  it('names a snapshot for every product that paints owned rows', () => {
    const missing = LOCAL_STORE_ROOTS.filter(
      (entry) => entry.snapshot === null && !entry.exemption
    );

    expect(missing.map((entry) => entry.product)).toEqual([]);
  });

  it.each(CHECKED.map((entry) => [entry.product, entry.root as string]))(
    '%s resolves its identity through the shared resolver',
    (product, root) => {
      const text = readFileSync(resolve(ROOT, root), 'utf8');

      expect(text, `${product}: ${root}`).toContain(RESOLVER);
      expect(text, `${product}: ${root} derives the partition from the session`).not.toContain(
        SESSION_USER
      );
    }
  );

  it.each(SNAPSHOTTED.map((entry) => [entry.product, entry.snapshot as string]))(
    '%s paints its last screen in the first frame',
    (product, snapshot) => {
      const text = readFileSync(resolve(ROOT, snapshot), 'utf8');

      expect(text, `${product}: ${snapshot} does not read a snapshot`).toContain(SNAPSHOT_READ);
      expect(text, `${product}: ${snapshot} does not record one`).toContain(SNAPSHOT_WRITE);
    }
  );
});
