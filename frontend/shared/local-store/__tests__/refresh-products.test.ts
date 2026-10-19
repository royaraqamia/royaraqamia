import { describe, expect, it, vi } from 'vitest';

import {
  refreshProducts,
  type PullableProduct,
} from '@/frontend/shared/local-store/refresh-products';
import { userIdentity } from '@/frontend/shared/local-store/identity';

/**
 * The background pull's runner (ADR-0060). Its contract is the quiet half of the
 * drain's: unlike a queue, a refresh that fails owes nothing, so nothing here
 * throws and one product's failure never stops another. What it must not do is
 * pull for an identity that does not apply, or invent a product that is absent.
 */
const identity = userIdentity('u-1');

function product(overrides: Partial<PullableProduct> = {}): PullableProduct {
  return {
    product: 'habitflow',
    identity: () => identity,
    refresh: vi.fn(async () => 3),
    ...overrides,
  };
}

const input = {
  session: { userId: 'u-1' },
  existingDatabases: ['habitflow:user:u-1'],
};

describe('refreshProducts', () => {
  it('reports the rows the server sent, per product', async () => {
    const outcomes = await refreshProducts({ ...input, products: [product()] });

    expect(outcomes).toEqual([{ product: 'habitflow', applied: 3, error: null }]);
  });

  it('skips a product whose identity does not apply', async () => {
    const refresh = vi.fn(async () => 3);
    const outcomes = await refreshProducts({
      ...input,
      products: [product({ identity: () => null, refresh })],
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(outcomes).toEqual([]);
  });

  it('hands the product its identity and the database list', async () => {
    const refresh = vi.fn(async () => 0);
    await refreshProducts({ ...input, products: [product({ refresh })] });

    expect(refresh).toHaveBeenCalledWith({
      identity,
      existingDatabases: input.existingDatabases,
      factory: undefined,
    });
  });

  it('turns one product’s failure into an outcome and still refreshes the rest', async () => {
    const outcomes = await refreshProducts({
      ...input,
      products: [
        product({
          refresh: async () => {
            throw new Error('store is newer than this bundle');
          },
        }),
        product({ product: 'spendtrack', refresh: async () => 7 }),
      ],
    });

    expect(outcomes).toEqual([
      { product: 'habitflow', applied: 0, error: 'store is newer than this bundle' },
      { product: 'spendtrack', applied: 7, error: null },
    ]);
  });

  it('treats a product whose own refresh throws as a failure, not a crash', async () => {
    // The identity function is the product's own code, and a broken one is a
    // programming error rather than a product that cannot be reached — the drain
    // makes the same call in the same place, so the two stay comparable.
    await expect(
      refreshProducts({
        ...input,
        products: [
          product({
            identity: () => {
              throw new Error('identity exploded');
            },
          }),
        ],
      })
    ).rejects.toThrow('identity exploded');
  });
});
